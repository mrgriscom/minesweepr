import collections
import itertools
import operator
import math

class InconsistencyError(Exception):
    """raise when a game state is logically inconsistent."""
    pass

"""represents the board geometry for traditional minesweeper, where the board
has fixed dimensions and fixed total # of mines.

total_cells -- total # of cells on board; all cells contained in rules + all
    'uncharted' cells
total_mines: total # of mines contained within all cells
"""
MineCount = collections.namedtuple('MineCount', ['total_cells', 'total_mines'])

def solve(rules, mine_prevalence, other_tag=None):
    """solve a minesweeper board.

    take in a minesweeper board and return the solution as a dict mapping each
    cell to its probability of being a mine.

    rules -- a set of 'Rule' describing the board
    mine_prevalence -- an object describing the total expected mines on the
        board. a MineCount indicates traditional minesweeper (fixed board
        dimensions with a total # of mines); a float indicates a fixed
        probability that any unknown cell is a mine (total # of mines will
        vary for given board dimensions, in a binomial distribution)
    other_tag -- tag used to represent all 'other' cells (all cells not
        mentioned in a rule) in the solution output
    """
    rules, all_cells = condense_supercells(rules)
    rules = reduce_rules(rules)

    determined = set(r for r in rules if r.is_trivial())
    rules -= determined

    ruleset = permute_and_interfere(rules)
    fronts = ruleset.split_fronts()

    trivial_fronts = set(f for f in fronts if f.is_trivial())
    determined |= set(f.trivial_rule() for f in trivial_fronts)
    fronts -= trivial_fronts

    stats = set(enumerate_front(f) for f in fronts)
    stats.update(r.tally() for r in determined)
    cell_probs = cell_probabilities(stats, mine_prevalence, all_cells)
    return dict(expand_cells(cell_probs, other_tag))

class Rule(object):
    """basic representation of an axiom from a minesweeper game: N mines
    contained within a set of M cells.

    only used during the very early stages of the algorithm; quickly converted
    to 'Rule_'

    num_mines -- # of mines
    cells -- list of cells; each 'cell' is a unique, identifying tag that
        represents that cell (string, int, any hashable)
    """

    def __init__(self, num_mines, cells):
        self.num_mines = num_mines
        self.cells = set_(cells)

    def condensed(self, rule_supercells_map):
        """condense supercells and convert to a 'Rule_'

        rule_supercells_map -- pre-computed supercell mapping
        """
        return Rule_(
            self.num_mines,
            rule_supercells_map.get(self, set_()), # default to handle degenerate rules
            len(self.cells)
        )

    def __repr__(self):
        return 'Rule(num_mines=%d, cells=%s)' % (self.num_mines, sorted(list(self.cells)))

class Rule_(object):
    """analogue of 'Rule', but containing supercells (sets of 'ordinary' cells
    that only ever appear together).

    this is the common rule form used throughout most of the algorithm

    num_mines -- total # of mines
    num_cells -- total # of base cells
    cells_ -- set of supercells; each supercell a set of base cells
    """

    def __init__(self, num_mines, cells_, num_cells=None):
        self.num_mines = num_mines
        self.cells_ = cells_
        self.num_cells = num_cells if num_cells is not None else sum(len(cell_) for cell_ in cells_)

        if self.num_mines < 0 or self.num_mines > self.num_cells:
            raise InconsistencyError('rule with negative mines / more mines than cells')

    def decompose(self):
        """if rule is completely full or empty of mines, split into sub-rules
        for each supercell"""
        if self.num_mines == 0 or self.num_mines == self.num_cells:
            for cell_ in self.cells_:
                size = len(cell_)
                yield Rule_(size if self.num_mines > 0 else 0, set_([cell_]), size)
            # degenerate rules (no cells) disappear here
        else:
            yield self

    def subtract(self, subrule):
        """if another rule is a sub-rule of this one, return a new rule
        covering only the difference"""
        return Rule_(self.num_mines - subrule.num_mines,
                     self.cells_ - subrule.cells_,
                     self.num_cells - subrule.num_cells)

    def permute(self):
        """generate all possible mine permutations of this rule"""
        for p in permute(self.num_mines, list(self.cells_)):
            yield p

    def is_subrule_of(self, parent):
        """return if this rule is a sub-rule of 'parent'

        'sub-rule' means this rule's cells are a subset of the parent rules'
        cells. equivalent rules are subrules of each other.
        """
        return self.cells_.issubset(parent.cells_)

    def is_trivial(self):
        """return whether this rule is trivial, i.e., has only one permutation"""
        return len(self.cells_) == 1

    def tally(self):
        """build a FrontTally from this *trivial* rule only"""
        return FrontTally.from_rule(self)

    def __repr__(self):
        return 'Rule_(num_mines=%d, num_cells=%d, cells_=%s)' % (self.num_mines, self.num_cells,
            sorted([sorted(list(cell_)) for cell_ in self.cells_]))

    @staticmethod
    def mk(num_mines, cells_):
        """helper method for creation

        num_mines -- total # of mines
        cells_ -- list of cells and supercells, where a supercell is a list of
            ordinary cells, e.g., ['A', ['B', 'C'], 'D']
        """
        cells_ = [listify(cell_) for cell_ in cells_]
        return Rule_(num_mines, set_(set_(cell_) for cell_ in cells_))

def condense_supercells(rules):
    """condense supercells by finding sets of ordinary cells that only ever
    appear together. returns a set of 'Rule_' corresponding to the original
    ruleset.

    rules -- original set of 'Rule' to analyze

    note that ALL cells are converted to supercells for ease of processing
    later, even if that cell does not group with any others. the result would
    be a singleton supercell
    """

    # for each cell, list of rules that cell appears in
    cell_rules_map = map_reduce(rules, lambda rule: [(cell, rule) for cell in rule.cells], set_)
    # for each 'list of rules appearing in', list of cells that share that ruleset (these cells
    # thus only ever appear together in the same rules)
    rules_supercell_map = map_reduce(cell_rules_map.iteritems(), lambda (cell, rules): [(rules, cell)], set_)
    # for each original rule, list of 'supercells' appearing in that rule
    rule_supercells_map = map_reduce(rules_supercell_map.iteritems(), lambda (rules, cell_): [(rule, cell_) for rule in rules], set_)

    return ([rule.condensed(rule_supercells_map) for rule in rules], rules_supercell_map.values())

def reduce_rules(rules):
    """reduce ruleset using logical deduction"""
    rr = RuleReducer()
    rr.add_rules(rules)
    return rr.reduce_all()

class Reduceable(object):
    """during the logical deduction phase, if all rules are nodes in a graph,
    this represents a directed edge in that graph indicating 'superrule' can
    be reduced by 'subrule'"""

    def __init__(self, superrule, subrule):
        self.superrule = superrule
        self.subrule = subrule

    def metric(self):
        """calculate the attractiveness of this reduction

        favor reductions that involve bigger rules, and amongst same-sized
        rules, those that yield # mines towards the extremes -- such rules
        have fewer permutations
        """

        num_reduced_cells = self.superrule.num_cells - self.subrule.num_cells
        num_reduced_mines = self.superrule.num_mines - self.subrule.num_mines
        return (self.superrule.num_cells, self.subrule.num_cells,
                abs(num_reduced_mines - .5 * num_reduced_cells))

    def reduce(self):
        """perform the reduction"""
        return self.superrule.subtract(self.subrule)

    def contains(self, rule):
        return rule in (self.superrule, self.subrule)

    def __repr__(self):
        return 'Reduceable(superrule=%s, subrule=%s)' % (self.superrule, self.subrule)

class CellRulesMap(object):
    """a utility class mapping cells to the rules they appear in"""

    def __init__(self, rules=[]):
        # a mapping: cell -> list of rules cell appears in
        self.map = collections.defaultdict(set)
        self.rules = []
        self.add_rules(rules)

    def add_rules(self, rules):
        for rule in rules:
            self.add_rule(rule)

    def add_rule(self, rule):
        self.rules.append(rule)
        for cell_ in rule.cells_:
            self.map[cell_].add(rule)

    def remove_rule(self, rule):
        self.rules.remove(rule)
        for cell_ in rule.cells_:
            self.map[cell_].remove(rule)

    def overlapping_rules(self, rule):
        """return set of rules that overlap 'rule', i.e., have at least one
        cell in common"""
        return reduce(operator.or_, (self.map[cell_] for cell_ in rule.cells_), set()) - set([rule])

    def interference_edges(self):
        """return pairs of all rules that overlap each other; each pair is
        represented twice ((a, b) and (b, a)) to support processing of
        relationships that are not symmetric"""
        def _interference_edges():
            for rule in self.rules:
                for rule_ov in self.overlapping_rules(rule):
                    yield (rule, rule_ov)
        return set(_interference_edges())

    def partition(self):
        """partition the ruleset into disjoint sub-rulesets of related rules.

        that is, all rules in a sub-ruleset are related to each other in some
        way through some number of overlaps, and no rules from separate
        sub-rulesets overlap each other. returns a set of partitions, each a
        set of rules.
        """
        related_rules = dict((rule, self.overlapping_rules(rule)) for rule in self.rules)
        partitions = set()
        while related_rules:
            start = related_rules.keys()[0]
            partition = graph_traverse(related_rules, start)
            partitions.add(partition)
            for rule in partition:
                del related_rules[rule]
        return partitions
            
    def cells_(self):
        """return all cells contained in ruleset"""
        return set_(self.map.keys())

class RuleReducer(object):
    """manager object that performs the 'logical deduction' phase of
    the solver; maintains a set of active rules, tracks which rules
    overlap with other rules, and iteratively reduces them until no
    further reductions are possible"""

    def __init__(self):
        # current list of rules
        self.active_rules = set()
        # reverse lookup for rules containing a given cell
        self.cell_rules_map = CellRulesMap()
        # current list of all possible reductions
        self.candidate_reductions = set() #todo: make this a priority queue

    def add_rules(self, rules):
        """add a set of rules to the ruleset"""
        for rule in rules:
            self.add_rule(rule)

    def add_rule(self, rule):
        """add a new rule to the active ruleset"""
        for base_rule in rule.decompose():
            self.add_base_rule(base_rule)

    def add_base_rule(self, rule):
        """helper for adding a rule"""
        self.active_rules.add(rule)
        self.cell_rules_map.add_rule(rule)
        self.update_reduceables(rule)

    def update_reduceables(self, rule):
        """update the index of which rules are reduceable from others"""
        rules_ov = self.cell_rules_map.overlapping_rules(rule)
        for rule_ov in rules_ov:
            if rule_ov.is_subrule_of(rule):
                # catches if rules are equivalent
                self.candidate_reductions.add(Reduceable(rule, rule_ov))
            elif rule.is_subrule_of(rule_ov):
                self.candidate_reductions.add(Reduceable(rule_ov, rule))

    def remove_rule(self, rule):
        """remove a rule from the active ruleset/index, presumably because it
        was reduced"""
        self.active_rules.remove(rule)
        self.cell_rules_map.remove_rule(rule)
        # todo: make this more efficient with an index of rule -> reduceables
        self.candidate_reductions = set(reduc for reduc in self.candidate_reductions if not reduc.contains(rule))

    def pop_best_reduction(self):
        """get the highest-value reduction to perform next"""
        reduction = max(self.candidate_reductions, key=lambda reduc: reduc.metric())
        self.candidate_reductions.remove(reduction)
        return reduction

    def reduce(self, reduction):
        """perform a reduction"""
        reduced_rule = reduction.reduce()
        self.remove_rule(reduction.superrule)
        self.add_rule(reduced_rule)

    def reduce_all(self):
        """run the manager"""
        while self.candidate_reductions:
            self.reduce(self.pop_best_reduction())

        return self.active_rules

class Permutation(object):
    """a single permutation of N mines among a set of (super)cells"""

    def __init__(self, mapping):
        """mapping -- a mapping: supercell -> # of mines therein

        cell set is determined implicitly from mapping, so all cells in set
        must have an entry, even if they have 0 mines"""
        self.mapping = dict(mapping)

    def subset(self, subcells):
        """return a sub-permutation containing only the cells in 'subcells'"""
        return Permutation((cell, self.mapping[cell]) for cell in subcells)

    def compatible(self, permu):
        """return whether this permutation is consistent with 'permu', meaning
        the cells they have in common have matching numbers of mines assigned"""
        overlap = self.cells() & permu.cells()
        return self.subset(overlap) == permu.subset(overlap)

    def combine(self, permu):
        """return a new permutation by combining this permutation with
        'permu'

        the permutations must be compatible!"""
        mapping = dict(self.mapping)
        mapping.update(permu.mapping)
        return Permutation(mapping)

    def k(self):
        """return total # mines in this permutation"""
        return sum(self.mapping.values())

    def cells(self):
        """return set of cells in this permutation"""
        return set(self.mapping)

    def multiplicity(self):
        """count the # of permutations this permutation would correspond to if
        each supercell were broken up into singleton cells.

        e.g., N mines in a supercell of M cells has (M choose N) actual
        configurations
        """
        return product(choose(len(cell_), k) for cell_, k in self.mapping.iteritems())

    def __eq__(self, x):
        return self.__dict__ == x.__dict__

    def __ne__(self, x):
        return not self.__eq__(x)

    def __hash__(self):
        return set_(self.mapping.iteritems()).__hash__()

    def __repr__(self):
        cell_counts = sorted([(sorted(list(cell)), count) for cell, count in self.mapping.iteritems()])
        cell_frags = ['%s:%d' % (','.join(str(c) for c in cell), count) for cell, count in cell_counts]
        return '{%s}' % ' '.join(cell_frags)

def permute(count, cells, permu=None):
    """generate all permutations of 'count' mines among 'cells'

    permu -- the sub-permutation in progress, when called as a recursive
        helper function. not actually a Permutation object, but a set of
        (key, value) pairs
    """

    def permu_add(*k):
        return permu.union(k)

    if permu is None:
        permu = set()

    if count == 0:
        yield Permutation(permu_add(*[(cell, 0) for cell in cells]))
    else:
        remaining_size = sum(len(cell) for cell in cells)
        if remaining_size == count:
            yield Permutation(permu_add(*[(cell, len(cell)) for cell in cells]))
        elif remaining_size >= count:
            cell = cells[0]
            for multiplicity in range(min(count, len(cell)), -1, -1):
                for p in permute(count - multiplicity, cells[1:], permu_add((cell, multiplicity))):
                    yield p

class PermutationSet(object):
    """a set of permutations of the same cell set and total # of mines

    may be the full set of possible permutations, or a subset as particular
    permutations are removed due to outside conflicts

    constrained -- False if the set is the full set of possible permutations;
        True if the set has since been reduced; accurate ONLY IF the
        PermutationSet was created with the full set of possibles
    """

    def __init__(self, cells_, k, permus):
        """
        cells_ -- set of supercells
        k -- # of mines
        permus -- set of 'Permutation's thereof; all permutations must share
            the same cell set and # of mines! (corresponding to 'cells_' and
            'k')
        """
        self.cells_ = cells_
        self.k = k
        self.permus = permus
        self.constrained = False

    @staticmethod
    def from_rule(rule):
        """build from all possible permutations of the given rule"""
        return PermutationSet(rule.cells_, rule.num_mines, set(rule.permute()))

    def to_rule(self):
        """back-construct a Rule_ from this set

        note that the set generated from self.to_rule().from_rule() may not
        match this set, as it cannot account for permutations removed from
        this set due to conflicts"""
        return Rule_(self.k, self.cells_)

    def __iter__(self):
        """return an iterator over the set"""
        return self.permus.__iter__()

    def remove(self, permu):
        """remove a permutation from the set, such as if that permutation
        conflicts with another rule"""
        self.permus.remove(permu)
        self.constrained = True

    def empty(self):
        """return whether the set is empty"""
        return not self.permus

    def compatible(self, permu):
        """return a new PermutationSet containing only the Permutations that
        are compatible with the given Permutation 'permu'"""
        return PermutationSet(self.cells_, self.k, set(p for p in self.permus if p.compatible(permu)))

    def subset(self, cell_subset):
        """return a new PermutationSet consisting of the sub-setted
        permutations from this set"""
        permu_subset = set(p.subset(cell_subset) for p in self.permus)
        k_sub = set(p.k() for p in permu_subset)
        if len(k_sub) > 1:
            # subset is not valid because permutations differ in # of mines
            raise ValueError()
        return PermutationSet(cell_subset, k_sub.pop(), permu_subset)

    def decompose(self):
        """see decompose(); optimizes if set has not been constrained because
        full permu-sets decompose to themselves"""
        return self._decompose() if self.constrained else [self]

    def _decompose(self, k_floor=1):
        """determine if the permutation set is the cartesian product of N
        smaller permutation sets; return the decomposition if so

        this set may be constrained, in which case at least one subset of the
        decomposition (if one exists) will also be constrained
        """
        for _k in range(k_floor, int(.5 * len(self.cells_)) + 1):
            for cell_subset in (set_(c) for c in itertools.combinations(self.cells_, _k)):
                try:
                    permu_subset, permu_remainder = self.split(cell_subset)
                except ValueError:
                    continue

                # lo, a cartesian divisor!
                divisors = [permu_subset]
                divisors.extend(permu_remainder._decompose(_k))
                return divisors

        return [self]

    def split(self, cell_subset):
        """helper function for decompose(). given a subset of cells, return
        the two permutation sets for the subset and the set of remaining
        cells, provided cell_subset is a valid decomposor; raise exception if
        not"""
        cell_remainder = self.cells_ - cell_subset
        permu_subset = self.subset(cell_subset)
        # exception thrown if subset cannot be a cartesian divisor; i.e., set
        # of permutations could not have originated from single 'choose'
        # operation

        # get the remaining permutation sets for each sub-permutation
        permu_remainders = set(map_reduce(self.permus,
            emitfunc=lambda p: [(p.subset(cell_subset), p)],
            reducefunc=lambda pv: set_(p.subset(cell_remainder) for p in pv)
        ).values())
        if len(permu_remainders) > 1:
            # remaining subsets are not identical for each sub-permutation; not
            # a cartesian divisor
            raise ValueError()
        permu_remainders = permu_remainders.pop()

        return (permu_subset, PermutationSet(cell_remainder, self.k - permu_subset.k, permu_remainders))

    def __repr__(self):
        return str(list(self.permus))

class PermutedRuleset(object):
    """a set of rules and the available permutations for each, eliminating
    permutations which are mutually-inconsistent across the ruleset"""

    def __init__(self, rules, permu_map=None):
        """
        rules -- ruleset
        permu_map -- if creating a subset of another PermutedRuleset, will be
            the permu_map of the parent; for a new PermutedRuleset, will be
            computed automatically
        """
        self.rules = rules
        self.cell_rules_map = CellRulesMap(rules)
        self.cells_ = self.cell_rules_map.cells_()

        def rule_permuset(r):
            return PermutationSet.from_rule(r) if permu_map is None else permu_map[r]
        # a mapping: rule -> PermutationSet for that rule
        self.permu_map = dict((rule, rule_permuset(rule)) for rule in rules)

    def cross_eliminate(self):
        """determine what permutations are possible for each rule, taking
        into account the constraints of all overlapping rules. eliminate
        impossible permutations"""

        interferences = self.cell_rules_map.interference_edges()

        # we can't simply iterate through 'interferences', as eliminating a
        # permutation in a rule may in turn invalidate permutations in other
        # overlapping rules that have already been processed, thus causing a
        # cascade effect
        while interferences:
            r, r_ov = interferences.pop()
            changed = False
            for permu in list(self.permu_map[r]): #copy iterable so we can modify original
                if self.permu_map[r_ov].compatible(permu).empty():
                    # this permutation has no compatible permutation in the overlapping
                    # rule. thus, it can never occur
                    self.permu_map[r].remove(permu)
                    changed = True

            if self.permu_map[r].empty():
                # no possible configurations for this rule remain
                raise InconsistencyError('rule is constrained such that it has no valid mine permutations')
            elif changed:
                # other rules overlapping with this one must be recalculated
                for r_other in self.cell_rules_map.overlapping_rules(r):
                    interferences.add((r_other, r))

    def rereduce(self):
        """after computing the possible permutations of the rules, analyze and
        decompose rules into sub-rules, if possible. this can eliminate
        dependencies among the initial set of rules, and thus potentially
        split what would have been one rule-front into several.

        this is analagous to the previous 'reduce_rules' step, but with more
        advanced logical analysis -- exploting information gleaned from the 
        permutation phase
        """

        """
        postulates that i'm pretty certain about, but can't quite prove
        *) among all cartesian decompositions from all rules, none will be reduceable with another
           (decomp'ed rules may have duplicates, though)
        *) cartesian decomposition will have effectively re-reduced all rules in the set, even non-
           decomp'ed rules; there will be no possible reductions between a decomp'ed rule and an
           original rule
        *) re-permuting amongst the de-comped ruleset will produce the same permutation sets
        """

        superseded_rules = set()
        decompositions = {}
        for rule, permu_set in self.permu_map.iteritems():
            decomp = permu_set.decompose()
            if len(decomp) > 1:
                superseded_rules.add(rule)
                # collapse duplicate decompositions by keying by cell set
                decompositions.update((dc.cells_, dc) for dc in decomp)

        for rule in superseded_rules:
            self.remove_rule(rule)
        for permu_set in decompositions.values():
            self.add_permu_set(permu_set)

    def remove_rule(self, rule):
        self.rules.remove(rule)
        self.cell_rules_map.remove_rule(rule)
        del self.permu_map[rule]

    def add_permu_set(self, permu_set):
        """add a 'decomposed' rule to the ruleset"""
        rule = permu_set.to_rule()
        self.rules.add(rule)
        self.cell_rules_map.add_rule(rule)
        self.permu_map[rule] = permu_set

    def filter(self, rule_subset):
        """return a PermutedRuleset built from this one containing only a
        subset of rules"""
        return PermutedRuleset(rule_subset, self.permu_map)

    def split_fronts(self):
        """split the ruleset into combinatorially-independent 'fronts'"""
        return set(self.filter(rule_subset) for rule_subset in self.cell_rules_map.partition())

    def is_trivial(self):
        """return whether this ruleset is trivial, i.e., contains only one rule"""
        return len(self.rules) == 1

    def trivial_rule(self):
        """return the singleton rule of this *trivial* ruleset"""
        singleton = _0(self.rules)

        # postulate: any singleton rule must also be trivial
        assert singleton.is_trivial()

        return singleton

    def enumerate(self):
        """enumerate all possible mine configurations for this ruleset"""
        for mineconfig in EnumerationState(self).enumerate():
            yield mineconfig

def permute_and_interfere(rules):
    """process the set of rules and analyze the relationships and constraints
    among them"""
    ruleset = PermutedRuleset(rules)
    ruleset.cross_eliminate()
    ruleset.rereduce()
    return ruleset

class EnumerationState(object):
    """a helper object to enumerate through all possible mine configurations of
    a ruleset"""

    def __init__(self, ruleset=None):
        """
        ruleset -- None when cloning an existing state
        """
        if ruleset is not None:
            # normal initialization
            self.fixed = set()
            self.free = dict((rule, set(permu_set)) for rule, permu_set in ruleset.permu_map.iteritems())
            self.overlapping_rules = lambda rule: ruleset.cell_rules_map.overlapping_rules(rule)
            self.compatible_rule_index = self.build_compatibility_index(ruleset)
            
    def clone(self):
        """clone this state"""
        state = EnumerationState()
        state.fixed = set(self.fixed)
        state.free = dict((rule, set(permu_set)) for rule, permu_set in self.free.iteritems())
        state.overlapping_rules = self.overlapping_rules
        state.compatible_rule_index = self.compatible_rule_index
        return state

    def build_compatibility_index(self, ruleset):
        index = {}
        for rule, permu_set in ruleset.permu_map.iteritems():
            for permu in permu_set:
                for rule_ov in self.overlapping_rules(rule):
                    index[(permu, rule_ov)] = set(ruleset.permu_map[rule_ov].compatible(permu))
        return index

    def is_complete(self):
        return not self.free
    
    def __iter__(self):
        rule = _0(self.free)
        for permu in self.free[rule]:
            try:
                yield self.propogate(rule, permu)
            except ValueError:
                # conflict detected; dead end
                pass

    def propogate(self, rule, permu):
        state = self.clone()
        state._propogate(rule, permu)
        return state

    def _propogate(self, rule, permu):
        self.fixed.add(permu)
        del self.free[rule]

        for related_rule in self.overlapping_rules(rule):
            # must check this on each iteration to properly handle dependency cycles
            if related_rule not in self.free:
                continue

            linked_permus = set(p for p in self.free[related_rule] if p in self.compatible_rule_index[(permu, related_rule)])
            self.free[related_rule] = linked_permus

            if len(linked_permus) == 0:
                # conflict
                raise ValueError()
            elif len(linked_permus) == 1:
                # only one possiblity; constrain further
                self._propogate(related_rule, _0(linked_permus))

    def mine_config(self):
        return reduce(lambda a, b: a.combine(b), self.fixed)

    def enumerate(self):
        if self.is_complete():
            yield self.mine_config()
        else:
            for next_state in self:
                for mineconfig in next_state.enumerate():
                    yield mineconfig

class FrontTally(object):
    def __init__(self, data=None):
        self.subtallies = collections.defaultdict(FrontSubtally) if data is None else data

    def tally(self, front):
        for config in front.enumerate():
            self.subtallies[config.k()].add(config)

        if not self.subtallies:
            # front has no possible configurations
            raise InconsistencyError('mine front has no possible configurations')

        self.finalize()

    def finalize(self):
        for subtally in self.subtallies.values():
            subtally.finalize()

    def min_mines(self):
        return min(self.subtallies)

    def max_mines(self):
        return max(self.subtallies)

    def is_static(self):
        return len(self.subtallies) == 1

    def __iter__(self):
        return self.subtallies.iteritems()

    def normalize(self):
        total = sum(subtally.total for subtally in self.subtallies.values())
        for subtally in self.subtallies.values():
            subtally.total /= float(total)
            
    def collapse(self):
        self.normalize()
        return map_reduce(self.subtallies.values(), lambda subtally: subtally.collapse(), sum)

    @staticmethod
    def from_rule(rule):
        if not rule.is_trivial():
            raise ValueError()

        return FrontTally({rule.num_mines: FrontSubtally.mk(choose(rule.num_cells, rule.num_mines), {_0(rule.cells_): rule.num_mines})})

    @staticmethod
    def for_other(num_uncharted_cells, mine_totals):
        metacell = UnchartedCell(num_uncharted_cells)
        return FrontTally(dict((num_mines, FrontSubtally.mk(k, {metacell: num_mines})) for num_mines, k in mine_totals.iteritems()))

    def __repr__(self):
        return str(dict(self.subtallies))

class FrontSubtally(object):
    def __init__(self):
        self.total = 0
        self.tally = collections.defaultdict(lambda: 0)

    def add(self, config):
        mult = config.multiplicity()
        self.total += mult
        for cell_, n in config.mapping.iteritems():
            self.tally[cell_] += n * mult

    def finalize(self):
        self.tally = dict((cell_, n / float(self.total)) for cell_, n in self.tally.iteritems())

    def collapse(self):
        for cell_, expected_mines in self.tally.iteritems():
            yield (cell_, self.total * expected_mines)

    @staticmethod
    def mk(total, tally):
        # tally must be pre-finalized
        o = FrontSubtally()
        o.total = total
        o.tally = tally
        return o

    def __repr__(self):
        return str((self.total, dict(self.tally)))

def enumerate_front(front):
    tally = FrontTally()
    tally.tally(front)
    return tally

def cell_probabilities(stats, mine_prevalence, all_cells):
    discrete_mode = isinstance(mine_prevalence, MineCount)

    if discrete_mode:
        num_uncharted_cells = check_count_consistency(stats, mine_prevalence, all_cells)

    dyn_stats = set(st for st in stats if not st.is_static())
    if discrete_mode:
        num_static_mines = sum(st.max_mines() for st in stats - dyn_stats)
        at_large_mines = mine_prevalence.total_mines - num_static_mines

        other_stat = combine_fronts(dyn_stats, num_uncharted_cells, at_large_mines)
        stats.add(other_stat)
    else:
        for st in dyn_stats:
            for num_mines, subtally in st:
                subtally.total *= nondiscrete_relative_likelihood(mine_prevalence, num_mines, st.min_mines())

    return itertools.chain(*(st.collapse().iteritems() for st in stats))

def check_count_consistency(stats, mine_prevalence, all_cells):
    min_possible_mines, max_possible_mines = possible_mine_limits(stats)
    num_uncharted_cells = mine_prevalence.total_cells - sum(len(cell_) for cell_ in all_cells)

    if min_possible_mines > mine_prevalence.total_mines:
        raise InconsistencyError('minimum possible number of mines is more than supplied mine count')
    if mine_prevalence.total_mines > max_possible_mines + num_uncharted_cells:
        # the max # of mines that can fit on the board is less than the total # specified
        raise InconsistencyError('maximum possible number of mines on board is less than supplied mine count')

    return num_uncharted_cells

def combine_fronts(stats, num_uncharted_cells, at_large_mines):
    Subtally = collections.namedtuple('Subtally', ['num_mines', 'count'])

    def combo(cross_entry):
        return tuple(Subtally(num_mines, subtally.total) for num_mines, subtally in cross_entry)

    min_possible_mines, _ = possible_mine_limits(stats)
    max_free_mines = min(max(at_large_mines - min_possible_mines, 0), num_uncharted_cells)
    grand_totals = [collections.defaultdict(lambda: 0) for st in stats]
    uncharted_total = collections.defaultdict(lambda: 0)
    stats = list(stats) # we need guaranteed iteration order

    for combination in (combo(e) for e in itertools.product(*stats)):
        num_free_mines = at_large_mines - sum(s.num_mines for s in combination)

        if num_free_mines < 0 or num_free_mines > num_uncharted_cells:
            k = 0.
        else:
            free_factor = discrete_relative_likelihood(num_uncharted_cells, num_free_mines, max_free_mines)
            k = free_factor * product(s.count for s in combination)
        
        for front_total, e in zip(grand_totals, combination):
            front_total[e.num_mines] += k
        uncharted_total[num_free_mines] += k

    for st, front_total in zip(stats, grand_totals):
        for num_mines, subtally in st:
            subtally.total = front_total[num_mines]

    return FrontTally.for_other(num_uncharted_cells, uncharted_total)

def possible_mine_limits(stats):
    return (sum(f(st) for st in stats) for f in (lambda st: st.min_mines(), lambda st: st.max_mines()))

def nondiscrete_relative_likelihood(p, k, k0):
    """given binomial probability (p,k,n) => p^k*(1-p)^(n-k),
    return binom_prob(p,k,n) / binom_prob(p,k0,n)"""
    if p < 0. or p > 1.:
        raise ValueError('p must be [0., 1.]')

    return float((p / (1 - p))**(k - k0))

def discrete_relative_likelihood(n, k, k0):
    """return 'n choose k' / 'n choose k0'"""
    if any(x < 0 or x > n for x in (k, k0)):
        raise ValueError('k, k0 must be [0, n]')

    return float(fact_div(k0, k) * fact_div(n - k0, n - k))

class UnchartedCell(object):
    def __init__(self, size):
        self.size = size

    def __len__(self):
        return self.size

    def __iter__(self):
        if self.size > 0:
            yield None

def expand_cells(cell_probs, other_tag):
    for cell_, p in cell_probs:
        for cell in cell_:
            yield (cell if cell is not None else other_tag, p / len(cell_))







set_ = frozenset

def fact_div(a, b):
    """return a! / b!"""
    return product(xrange(b + 1, a + 1)) if a >= b else 1. / fact_div(b, a)

def choose(n, k):
    """return n choose k

    resilient (though not immune) to integer overflow"""
    if n == 1:
        # optimize by far most-common case
        return 1

    return fact_div(n, max(k, n - k)) / math.factorial(min(k, n - k))

def _0(iterable):
    """return the first item of an iterable"""
    return iter(iterable).next()

def product(n):
    """return the product of a set of numbers

    n -- an iterable of numbers"""
    return reduce(operator.mul, n, 1)

def map_reduce(data, emitfunc=lambda rec: [(rec,)], reducefunc=lambda v: v):
    """perform a "map-reduce" on the data

    emitfunc(datum): return an iterable of key-value pairings as (key, value). alternatively, may
        simply emit (key,) (useful for reducefunc=len)
    reducefunc(values): applied to each list of values with the same key; defaults to just
        returning the list
    data: iterable of data to operate on
    """
    mapped = collections.defaultdict(list)
    for rec in data:
        for emission in emitfunc(rec):
            try:
                k, v = emission
            except ValueError:
                k, v = emission[0], None
            mapped[k].append(v)
    return dict((k, reducefunc(v)) for k, v in mapped.iteritems())

def listify(x):
    """convert object to a list; if not an iterable, wrap as a list of length 1"""
    return list(x) if hasattr(x, '__iter__') else [x]

def graph_traverse(graph, node):
    """graph traversal algorithm -- given a graph and a node, return the set
    of nodes that can be reached from 'node', including 'node' itself""" 
    nodes = set()
    _graph_traverse(graph, node, nodes)
    return set_(nodes)

def _graph_traverse(graph, node, visited):
    """graph traversal helper"""
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            _graph_traverse(graph, neighbor, visited)

