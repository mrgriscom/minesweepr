import collections

class InconsistencyError(Exception):
    pass

MineCount = collections.namedtuple('MineCount', ['total_cells', 'total_mines'])
# total_cells: total # of cells on board; all cells contained in rules + all
#   'uncharted' cells
# total_mines: total # of mines contained within all cells

class Rule(object):
    # num_mines: # of mines contained in 'cells'
    # cells: set of cell ids

    def __init__(self, num_mines, cells):
        self.num_mines = num_mines
        self.cells = set_(cells)

    def condensed(self, rule_supercells_map):
        return Rule_(self.num_mines, len(self.cells), rule_supercells_map[self])

    def __repr__(self):
        return 'Rule(num_mines=%d, cells=%s)' % (self.num_mines, sorted(list(self.cells)))

class Rule_(object):
    # num_mines: # of mines contained in 'cells_'
    # num_cells: # of base cells in 'cells_'
    # cells: set of supercells; each supercell a set of base cells
    
    def __init__(self, num_mines, num_cells, cells_):
        self.num_mines = num_mines
        self.num_cells = num_cells
        self.cells_ = cells_

        if self.num_mines < 0 or self.num_mines > self.num_cells:
            raise InconsistencyError()

    def decompose(self):
        if self.num_mines == 0 or self.num_mines == self.num_cells:
            for cell_ in self.cells_:
                size = len(cell_)
                yield Rule_(size if self.num_mines > 0 else 0, size, set_([cell_]))
            # degenerate rules (no cells) disappear here
        else:
            yield self

    def subtract(self, subrule):
        return Rule_(self.num_mines - subrule.num_mines,
                     self.num_cells - subrule.num_cells,
                     self.cells_ - subrule.cells_)

    def permute(self):
        for p in permute(self.num_mines, list(self.cells_)):
            yield p

    def is_subrule_of(self, parent):
        return self.cells_.issubset(parent.cells_)
        # equivalent rules are subrules of each other

    def __repr__(self):
        return 'Rule_(num_mines=%d, num_cells=%d, cells_=%s)' % (self.num_mines, self.num_cells,
            sorted([sorted(list(cell_)) for cell_ in self.cells_]))

    @staticmethod
    def mk(num_mines, cells_):
        def listify(x):
            return x if hasattr(x, '__iter__') else [x]
        cells_ = [listify(cell_) for cell_ in cells_]
        return Rule_(num_mines, sum(len(cell_) for cell_ in cells_), set_(set_(cell_) for cell_ in cells_))

def solve(rules, mine_prevalence):
    # mine_prevalence is a MineCount or float (base probability that cell is mine)

    rules, _ = condense_supercells(rules)
    rules = reduce_rules(rules)

    for r in rules:
        print r
        for p in sorted([str(px) for px in r.permute()]):
            print p

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

class RuleReducer(object):
    def __init__(self):
        # current list of rules
        self.active_rules = set()
        # mapping of cells to list of rules containing that cell
        self.cell_rules_map = collections.defaultdict(set)
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
        # update reduceables before cell index or else rule will reduce against itself
        self.update_reduceables(rule)
        for cell_ in rule.cells_:
            self.cell_rules_map[cell_].add(rule)

    def update_reduceables(self, rule):
        overlapping_rules = reduce(lambda a, b: a.union(b), (self.cell_rules_map[cell_] for cell_ in rule.cells_), set())
        for rule_ov in overlapping_rules:
            if rule_ov.is_subrule_of(rule):
                # catches if rules are equivalent
                self.candidate_reductions.add(Reduceable(rule, rule_ov))
            elif rule.is_subrule_of(rule_ov):
                self.candidate_reductions.add(Reduceable(rule_ov, rule))

    def remove_rule(self, rule):
        self.active_rules.remove(rule)
        for cell_ in rule.cells_:
            self.cell_rules_map[cell_].remove(rule)
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
    if not include_all_mines:
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
