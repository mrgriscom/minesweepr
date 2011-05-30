import collections
import itertools
import operator

class InconsistencyError(Exception):
    pass

MineCount = collections.namedtuple('MineCount', ['total_cells', 'total_mines'])
# total_cells: total # of cells on board; all cells contained in rules + all
#   'uncharted' cells
# total_mines: total # of mines contained within all cells

def solve(rules, mine_prevalence):
    # mine_prevalence is a MineCount or float (base probability that cell is mine)

    rules, _ = condense_supercells(rules)
    rules = reduce_rules(rules)

    determined = set(r for r in rules if r.is_trivial())
    rules -= determined

    ruleset = permute_and_interfere(rules)
    fronts = ruleset.split_fronts()

    trivial_fronts = set(f for f in fronts if f.is_trivial())
    determined |= set(f.trivial_rule() for f in trivial_fronts)
    fronts -= trivial_fronts

    print determined
    print [f.cells_ for f in fronts]

    for f in fronts:
        print list(f.enumerate())

class Rule(object):
    # num_mines: # of mines contained in 'cells'
    # cells: set of cell ids

    def __init__(self, num_mines, cells):
        self.num_mines = num_mines
        self.cells = set_(cells)

    def condensed(self, rule_supercells_map):
        return Rule_(self.num_mines, rule_supercells_map[self], len(self.cells))

    def __repr__(self):
        return 'Rule(num_mines=%d, cells=%s)' % (self.num_mines, sorted(list(self.cells)))

class Rule_(object):
    # num_mines: # of mines contained in 'cells_'
    # num_cells: # of base cells in 'cells_'
    # cells: set of supercells; each supercell a set of base cells
    
    def __init__(self, num_mines, cells_, num_cells=None):
        self.num_mines = num_mines
        self.cells_ = cells_
        self.num_cells = num_cells if num_cells is not None else sum(len(cell_) for cell_ in cells_)

        if self.num_mines < 0 or self.num_mines > self.num_cells:
            raise InconsistencyError()

    def decompose(self):
        if self.num_mines == 0 or self.num_mines == self.num_cells:
            for cell_ in self.cells_:
                size = len(cell_)
                yield Rule_(size if self.num_mines > 0 else 0, set_([cell_]), size)
            # degenerate rules (no cells) disappear here
        else:
            yield self

    def subtract(self, subrule):
        return Rule_(self.num_mines - subrule.num_mines,
                     self.cells_ - subrule.cells_,
                     self.num_cells - subrule.num_cells)

    def permute(self):
        for p in permute(self.num_mines, list(self.cells_)):
            yield p

    def is_subrule_of(self, parent):
        return self.cells_.issubset(parent.cells_)
        # equivalent rules are subrules of each other

    def is_trivial(self):
        return len(self.cells_) == 1

    def __repr__(self):
        return 'Rule_(num_mines=%d, num_cells=%d, cells_=%s)' % (self.num_mines, self.num_cells,
            sorted([sorted(list(cell_)) for cell_ in self.cells_]))

    @staticmethod
    def mk(num_mines, cells_):
        def listify(x):
            return x if hasattr(x, '__iter__') else [x]
        cells_ = [listify(cell_) for cell_ in cells_]
        return Rule_(num_mines, set_(set_(cell_) for cell_ in cells_))

def condense_supercells(rules):
    cell_rules_map = map_reduce(rules, lambda rule: [(cell, rule) for cell in rule.cells], set_)
    rules_supercell_map = map_reduce(cell_rules_map.iteritems(), lambda (cell, rules): [(rules, cell)], set_)
    rule_supercells_map = map_reduce(rules_supercell_map.iteritems(), lambda (rules, cell_): [(rule, cell_) for rule in rules], set_)
    return ([rule.condensed(rule_supercells_map) for rule in rules], rules_supercell_map.values())

def reduce_rules(rules):
    rr = RuleReducer()
    rr.add_rules(rules)
    return rr.reduce_all()

class Reduceable(object):
    def __init__(self, superrule, subrule):
        self.superrule = superrule
        self.subrule = subrule

    def metric(self):
        num_reduced_cells = self.superrule.num_cells - self.subrule.num_cells
        num_reduced_mines = self.superrule.num_mines - self.subrule.num_mines
        # favor reductions that involve bigger rules, and amongst same-sized rules, those
        # that yield # mines towards the extremes -- such rules have fewer permutations
        return (self.superrule.num_cells, self.subrule.num_cells,
                abs(num_reduced_mines - .5 * num_reduced_cells))

    def reduce(self):
        return self.superrule.subtract(self.subrule)

    def contains(self, rule):
        return rule in (self.superrule, self.subrule)

    def __repr__(self):
        return 'Reduceable(superrule=%s, subrule=%s)' % (self.superrule, self.subrule)

class CellRulesMap(object):
    def __init__(self, rules=[]):
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
        return reduce(operator.or_, (self.map[cell_] for cell_ in rule.cells_), set()) - set([rule])

    def interference_edges(self):
        interferences = set()
        for rule in self.rules:
            for rule_ov in self.overlapping_rules(rule):
                interferences.add((rule, rule_ov))
        return interferences

    def partition(self):
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
        return set_(self.map.keys())

def graph_traverse(graph, node):
    nodes = set()
    _graph_traverse(graph, node, nodes)
    return set_(nodes)

def _graph_traverse(graph, node, visited):
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            _graph_traverse(graph, neighbor, visited)

class RuleReducer(object):
    def __init__(self):
        # current list of rules
        self.active_rules = set()
        # reverse lookup for rules containing a given cell
        self.cell_rules_map = CellRulesMap()
        # current list of all possible reductions
        self.candidate_reductions = set() #could make this a priority queue for efficiency

    def add_rules(self, rules):
        for rule in rules:
            self.add_rule(rule)

    def add_rule(self, rule):
        for base_rule in rule.decompose():
            self.add_base_rule(base_rule)

    def add_base_rule(self, rule):
        self.active_rules.add(rule)
        self.cell_rules_map.add_rule(rule)
        self.update_reduceables(rule)

    def update_reduceables(self, rule):
        rules_ov = self.cell_rules_map.overlapping_rules(rule)
        for rule_ov in rules_ov:
            if rule_ov.is_subrule_of(rule):
                # catches if rules are equivalent
                self.candidate_reductions.add(Reduceable(rule, rule_ov))
            elif rule.is_subrule_of(rule_ov):
                self.candidate_reductions.add(Reduceable(rule_ov, rule))

    def remove_rule(self, rule):
        self.active_rules.remove(rule)
        self.cell_rules_map.remove_rule(rule)
        # could make this more efficient with an index rule -> reduceables
        self.candidate_reductions = set(reduc for reduc in self.candidate_reductions if not reduc.contains(rule))

    def pop_best_reduction(self):
        reduction = max(self.candidate_reductions, key=lambda reduc: reduc.metric())
        self.candidate_reductions.remove(reduction)
        return reduction

    def reduce(self, reduction):
        reduced_rule = reduction.reduce()
        self.remove_rule(reduction.superrule)
        self.add_rule(reduced_rule)

    def reduce_all(self):
        while self.candidate_reductions:
            self.reduce(self.pop_best_reduction())

        return self.active_rules

class Permutation(object):
    def __init__(self, mapping):
        self.mapping = dict(mapping)

    def subset(self, subcells):
        return Permutation((cell, self.mapping[cell]) for cell in subcells)

    def compatible(self, permu):
        overlap = set(self.mapping) & set(permu.mapping)
        return self.subset(overlap) == permu.subset(overlap)

    def combine(self, permu):
        # assume permu is compatible
        mapping = dict(self.mapping)
        mapping.update(permu.mapping)
        return Permutation(mapping)

    def k(self):
        return sum(self.mapping.values())

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
    def __init__(self, cells_, k, permus):
        self.cells_ = cells_
        self.k = k
        self.permus = permus
        self.constrained = False

    @staticmethod
    def from_rule(rule):
        return PermutationSet(rule.cells_, rule.num_mines, set(rule.permute()))

    def to_rule(self):
        return Rule_(self.k, self.cells_)

    def __iter__(self):
        return self.permus.__iter__()

    def remove(self, permu):
        self.permus.remove(permu)
        self.constrained = True

    def empty(self):
        return not self.permus

    def compatible(self, permu):
        return PermutationSet(self.cells_, self.k, set(p for p in self.permus if p.compatible(permu)))

    def decompose(self):
        return self._decompose() if self.constrained else [self]

    def _decompose(self, k_floor=1):
        """determine if the permutation set is the cartesian product of
        N smaller permutation sets; return the decomposition if so

        permus must be a subset of 'cells_ choose k' for some k
        """
        for _k in range(k_floor, int(.5 * len(self.cells_)) + 1):
            for cell_subset in (set_(c) for c in itertools.combinations(self.cells_, _k)):
                try:
                    permu_subset, permu_remainder = self.split(cell_subset)
                except ValueError:
                    continue

                # cartesian divisor!
                divisors = [permu_subset]
                divisors.extend(permu_remainder._decompose(_k))
                return divisors

        return [self]

    def split(self, cell_subset):
        cell_remainder = self.cells_ - cell_subset
        permu_subset = set(p.subset(cell_subset) for p in self.permus)

        k_sub = set(p.k() for p in permu_subset)
        if len(k_sub) > 1:
            # subset cannot be a cartesian divisor; k-values of sub-
            # permutations differ, so impossible to originate from single
            # 'choose' operation
            raise ValueError()
        k_sub = k_sub.pop()

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

        return (PermutationSet(cell_subset, k_sub, permu_subset),
                PermutationSet(cell_remainder, self.k - k_sub, permu_remainders))

    def __repr__(self):
        return str(list(self.permus))

class PermutedRuleset(object):
    def __init__(self, rules, permu_map=None):
        self.rules = rules
        self.cell_rules_map = CellRulesMap(rules)
        self.cells_ = self.cell_rules_map.cells_()
        self.permu_map = dict((rule, PermutationSet.from_rule(rule)) for rule in rules) if permu_map is None else permu_map

    def cross_eliminate(self):
        interferences = self.cell_rules_map.interference_edges()
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
                raise InconsistencyError()
            elif changed:
                # other rules overlapping with this one must be recalculated
                for r_other in self.cell_rules_map.overlapping_rules(r):
                    interferences.add((r_other, r))

    def rereduce(self):
        # postulates that i'm pretty certain about, but can't quite prove
        # *) among all cartesian decompositions from all rules, none will be reduceable with another
        #    (decomp'ed rules may have duplicates, though)
        # *) cartesian decomposition will have effectively re-reduced all rules in the set, even non-
        #    decomp'ed rules; there will be no possible reductions between a decomp'ed rule and an
        #    original rule
        # *) re-permuting amongst the de-comped ruleset will produce the same permutation sets

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
        rule = permu_set.to_rule()
        self.rules.add(rule)
        self.cell_rules_map.add_rule(rule)
        self.permu_map[rule] = permu_set

    def filter(self, rule_subset):
        return PermutedRuleset(rule_subset, dict((rule, self.permu_map[rule]) for rule in rule_subset))

    def split_fronts(self):
        return set(self.filter(rule_subset) for rule_subset in self.cell_rules_map.partition())

    def is_trivial(self):
        return len(self.rules) == 1

    def trivial_rule(self):
        singleton = iter(self.rules).next()
        # postulate: any singleton rule must also be trivial
        assert singleton.is_trivial()
        return singleton

    def enumerate(self):
        for mineconfig in _enumerate(EnumerationState(self)):
            yield mineconfig

def _enumerate(enum_state):
    if enum_state.is_complete():
        yield enum_state.mine_config()
    else:
        for next_state in enum_state.iterate():
            for mineconfig in _enumerate(next_state):
                yield mineconfig

class EnumerationState(object):
    def __init__(self, ruleset=None, from_state=None):
        if not from_state:
            self.fixed = set()
            self.free = dict((rule, set(permu_set)) for rule, permu_set in ruleset.permu_map.iteritems())
            self.overlapping_rules = lambda rule: ruleset.cell_rules_map.overlapping_rules(rule)
            self.compatible_rule_index = self.build_compatibility_index(ruleset)
        else:
            # clone existing state
            self.fixed = set(from_state.fixed)
            self.free = dict((rule, set(permu_set)) for rule, permu_set in from_state.free.iteritems())
            self.overlapping_rules = from_state.overlapping_rules
            self.compatible_rule_index = from_state.compatible_rule_index
            
    def build_compatibility_index(self, ruleset):
        index = {}
        for rule, permu_set in ruleset.permu_map.iteritems():
            for permu in permu_set:
                for rule_ov in self.overlapping_rules(rule):
                    index[(permu, rule_ov)] = set(ruleset.permu_map[rule_ov].compatible(permu))
        return index

    def is_complete(self):
        return not self.free
    
    def iterate(self):
        rule = self.active_rule()
        for permu in self.free[rule]:
            next_state = self.propogate(rule, permu)
            if next_state is not None:
                # if None, conflict detected; dead end
                yield next_state

    def active_rule(self):
        return iter(self.free).next()

    def propogate(self, rule, permu):
        return EnumerationState(from_state=self)._propogate(rule, permu)

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
                return None
            elif len(linked_permus) == 1:
                # only one possiblity; constrain further
                only_permu = iter(linked_permus).next()
                return self._propogate(related_rule, only_permu)
        return self

    def mine_config(self):
        return reduce(lambda a, b: a.combine(b), self.fixed)

        



def permute_and_interfere(rules):
    ruleset = PermutedRuleset(rules)
    ruleset.cross_eliminate()
    ruleset.rereduce()
    return ruleset





def read_board(board, total_mines, include_all_mines=False, include_clears=False):
    #. = blank; * = mine; x = unknown; N = count
    lines = [ln.strip() for ln in board.strip().split('\n')]
    height = len(lines)
    width = len(lines[0])

    def adjacent((row, col)):
        for r in range(max(row - 1, 1), min(row + 2, height + 1)):
            for c in range(max(col - 1, 1), min(col + 2, width + 1)):
                if (r, c) != (row, col):
                    yield (r, c)

    cells = {}
    for row, ln in enumerate(lines):
        for col, c in enumerate(ln):
            cells[(row + 1, col + 1)] = c

    def mkrule(mines, cells):
        return Rule(mines, ['%d-%d' % cell for cell in cells])

    rules = []
    clears = []
    relevant_mines = set()
    for cell_id, state in cells.iteritems():
        if state == '*':
            if include_all_mines:
                rules.append(mkrule(1, [cell_id]))
        elif state in '.':
            clears.append(cell_id)
        elif state in '12345678':
            clears.append(cell_id)
            neighbors = dict((nid, cells[nid]) for nid in adjacent(cell_id))
            if 'x' in neighbors.values():
                rules.append(mkrule(int(state), [nid for nid, nstate in neighbors.iteritems() if nstate in ('x', '*')]))
                relevant_mines.update([nid for nid, nstate in neighbors.iteritems() if nstate == '*'])
    if include_clears:
        rules.append(mkrule(0, clears))
    if not include_all_mines: #TODO fix
        rules.append(mkrule(len(relevant_mines), relevant_mines))

    return rules

set_ = frozenset

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
