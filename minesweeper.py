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
        pass

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





#  fun reduceRules (candidateRules : rule IntMap.map, allCells : IntRel) (*: (rule IntMap.map * graph)*) = let
#    fun addRule (candidateRule, (builtRules, cellRulesMap, ruleInterference, ruleReductions)) = let 
#      fun add (rule, (builtRules, cellRulesMap, ruleInterference, ruleReductions)) = let
#        val ruleid = getUid()
#        val {cells, ...} = rule
#        val numCells = IntSet.numItems(cells)
#        val ruleFull = (ruleid, rule)
#
#        fun indexRuleByCell (cell, (cellRulesMap, ruleInterference, ruleReductions)) = let
#          val relatedRules = case IntMap.find(cellRulesMap, cell) of
#                               SOME x => x
#                             | NONE => IntSet.empty
#
#          fun relateRule () = let
#            fun relateRuleByCell (relatedRule, (ruleInterference, ruleReductions)) = let
#              val otherRule = valOf(IntMap.find(builtRules, relatedRule))
#              val numCellsOther = IntSet.numItems(#cells otherRule)
#              val otherRuleFull = (relatedRule, otherRule)
#
#              val subset = IntSet.add(case graphEdgeData(ruleInterference, (ruleid, relatedRule)) of 
#                                        SOME x => x
#                                      | NONE => IntSet.empty, cell)
#
#              val reduction = if IntSet.numItems subset = numCells then
#                                SOME {subset = ruleFull, superset = otherRuleFull}
#                              else if IntSet.numItems subset = numCellsOther then
#                                SOME {subset = otherRuleFull, superset = ruleFull}
#                              else
#                                NONE
#            in
#              (graphAddEdge(ruleInterference, (ruleid, relatedRule), subset),
#               case reduction of SOME x => RRPQ.insert(x, ruleReductions)
#                               | NONE => ruleReductions)
#            end
#          in
#            IntSet.foldl relateRuleByCell (ruleInterference, ruleReductions) relatedRules
#          end
#
#          val cellRulesMap = IntMap.insert(cellRulesMap, cell, IntSet.add(relatedRules, ruleid))
#          val (ruleInterference, ruleReductions) = relateRule()
#        in
#          (cellRulesMap, ruleInterference, ruleReductions)
#        end
#
#        val builtRules = IntMap.insert(builtRules, ruleid, rule)
#        val ruleInterference = graphAddNode(ruleInterference, ruleid)
#        val (cellRulesMap, ruleInterference, ruleReductions) = IntSet.foldl indexRuleByCell (cellRulesMap, ruleInterference, ruleReductions) cells
#      in
#        (* debug *) print ("adding rule " ^ (Int.toString ruleid) ^ " (" ^ (strrule rule) ^ "):\n");
#        (* debug *) print ("rule added. current state:\n" ^ strreducstate(builtRules, cellRulesMap, ruleInterference, ruleReductions));
#
#        (builtRules, cellRulesMap, ruleInterference, ruleReductions)
#      end
#
#      fun degenerateRule (cell, hasMines) = let
#        val numCells' = IntSet.numItems(valOf(IntMap.find(allCells, cell)))
#        val numMines = if hasMines then numCells' else 0
#      in
#        {numCells' = numCells', numMines = numMines, cells = IntSet.singleton(cell)}
#      end
#      
#      val {numMines, numCells', cells} = candidateRule
#      val numCells = IntSet.numItems cells
#    in
#      (* debug *) print ("adding candidate (" ^ (strrule candidateRule) ^ "):\n");
#
#      if (numMines < 0) orelse (numMines > numCells') then (* inconsistent *)
#        ((* debug *) print "inconsistent rule!!\n";
#        raise Inconsistent
#        )
#      else if numCells = 0 then (* empty *)
#        ((* debug *) print "empty rule\n";
#        (builtRules, cellRulesMap, ruleInterference, ruleReductions)
#        )
#      else if numCells > 1 andalso ((numMines = 0) orelse (numMines = numCells')) then (* splittable *)
#        ((* debug *) print "splitting rule\n";
#        IntSet.foldl (fn (cell, indexState) => add(degenerateRule(cell, numMines > 0), indexState)) (builtRules, cellRulesMap, ruleInterference, ruleReductions) cells
#        )
#      else
#        add(candidateRule, (builtRules, cellRulesMap, ruleInterference, ruleReductions))
#    end
#
#    fun removeRule (ruleid, (builtRules, cellRulesMap, ruleInterference, ruleReductions)) = let
#      val (builtRules, {cells, ...} : rule) = IntMap.remove(builtRules, ruleid)
#      val cellRulesMap = IntSet.foldl (fn (cell, crm) =>  IntMap.insert(crm, cell, IntSet.delete(valOf(IntMap.find(crm, cell)), ruleid))) cellRulesMap cells
#      val ruleInterference = graphDeleteNode(ruleInterference, ruleid)
#      val ruleReductions = RRPQfilter (fn ({subset = (sub, _), superset = (sup, _)}) => not (sub = ruleid orelse sup = ruleid)) ruleReductions
#    in
#      (builtRules, cellRulesMap, ruleInterference, ruleReductions)
#    end
#
#    fun subtractRule ({numCells' = subNumCells', numMines = subNumMines, cells = subCells},
#                      {numCells' = supNumCells', numMines = supNumMines, cells = supCells}) =
#      {numCells' = supNumCells' - subNumCells', numMines = supNumMines - subNumMines, cells = IntSet.difference(supCells, subCells)}
#
#    fun reduceRule (reduction, (builtRules, cellRulesMap, ruleInterference, ruleReductions)) = let
#      val {subset = (_, subsetRule), superset = (superset, supersetRule)} = reduction
#
#      (* debug *) val xxx = let in print ("reducing rule " ^ (Int.toString superset) ^ " by rule " ^ (Int.toString (#1 (#subset reduction))) ^ "\n") end
#
#      val reducedRule = subtractRule(subsetRule, supersetRule)
#      val (builtRules, cellRulesMap, ruleInterference, ruleReductions) = removeRule(superset, (builtRules, cellRulesMap, ruleInterference, ruleReductions))
#      val (builtRules, cellRulesMap, ruleInterference, ruleReductions) = addRule(reducedRule, (builtRules, cellRulesMap, ruleInterference, ruleReductions))
#    in
#      (builtRules, cellRulesMap, ruleInterference, ruleReductions)
#    end
#
#    fun reduceAll (builtRules, cellRulesMap, ruleInterference, ruleReductions) = if RRPQ.isEmpty ruleReductions then
#      (builtRules, cellRulesMap, ruleInterference, ruleReductions)
#    else let val (reduction, ruleReductions) = RRPQ.remove(ruleReductions) in
#      reduceAll(reduceRule(reduction, (builtRules, cellRulesMap, ruleInterference, ruleReductions)))
#    end
#
#    val (builtRules, cellRulesMap, ruleInterference, ruleReductions) = IntMap.foldl addRule (IntMap.empty, IntMap.empty, graphEmpty(), RRPQ.empty) candidateRules
#    val (builtRules, cellRulesMap, ruleInterference, ruleReductions) = reduceAll(builtRules, cellRulesMap, ruleInterference, ruleReductions)
#  in
#    (* debug *) print ("\n\nfinal reduction:\n" ^ strreducstate(builtRules, cellRulesMap, ruleInterference, ruleReductions));
#    (builtRules, cellRulesMap, ruleInterference) (* (builtRules, ruleInterference) *)
#  end








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
