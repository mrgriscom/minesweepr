import unittest
import collections
from minesweeper import *

#multiset = collections.Counter

#def sets(o):
#    return set_(sets(k) if hasattr(k, '__iter__') else k for k in o)

def r(s):
    """helper function to generate a (raw) Rule"""
    mines, cells = s.split(':')
    cells = cells.split(',') if cells else []
    assert all(len(c) == 1 for c in cells)
    return Rule(int(mines), cells)

def R(s):
    """helper function to generate a Rule_"""
    mines, cells = s.split(':')
    cells = map(list, cells.split(',')) if cells else []
    return Rule_.mk(int(mines), cells)

class Test(unittest.TestCase):
    def test_rule_init(self):
        self.assertEqual(R('0:').num_cells, 0)
        self.assertEqual(R('0:a').num_cells, 1)
        self.assertEqual(R('0:a,b,c').num_cells, 3)
        self.assertEqual(R('0:ab,c').num_cells, 3)
        self.assertEqual(R('0:abc').num_cells, 3)
        self.assertEqual(R('0:abc,de').num_cells, 5)

        self.assertRaises(InconsistencyError, R, '-1:')
        self.assertRaises(InconsistencyError, R, '1:')
        self.assertRaises(InconsistencyError, R, '-1:a')
        self.assertRaises(InconsistencyError, R, '2:a')
        self.assertRaises(InconsistencyError, R, '4:ab,c')

        # check for lack of exception -- #mines=0 checked above
        self.assertIsNotNone(R('1:a'))
        self.assertIsNotNone(R('3:ab,c'))

    def test_rule_decompose(self):
        self.assertEqual(set(R('0:').decompose()), set())
        self.assertEqual(set(R('0:a').decompose()), set([R('0:a')]))
        self.assertEqual(set(R('1:a').decompose()), set([R('1:a')]))
        self.assertEqual(set(R('0:abc,de,f').decompose()), set([
                         R('0:abc'),
                         R('0:de'),
                         R('0:f'),
        ]))
        self.assertEqual(set(R('1:abc,de,f').decompose()), set([R('1:abc,de,f')]))
        self.assertEqual(set(R('5:abc,de,f').decompose()), set([R('5:abc,de,f')]))
        self.assertEqual(set(R('6:abc,de,f').decompose()), set([
                         R('3:abc'),
                         R('2:de'),
                         R('1:f'),
        ]))

    def test_rule_subtract(self):
        self.assertTrue(R('0:').is_subrule_of(R('0:')))
        self.assertTrue(R('0:').is_subrule_of(R('2:ab,c')))
        self.assertTrue(R('2:ab,c').is_subrule_of(R('2:ab,c')))
        self.assertTrue(R('0:c').is_subrule_of(R('2:ab,c')))
        self.assertTrue(R('1:ab').is_subrule_of(R('2:ab,c')))
        self.assertTrue(R('1:ab').is_subrule_of(R('1:ab,c')))
        self.assertFalse(R('1:a,b').is_subrule_of(R('1:a,c')))
        # following should not occur in practice
        self.assertFalse(R('1:a,b').is_subrule_of(R('1:ab')))
        self.assertFalse(R('1:ab').is_subrule_of(R('1:a,b')))
        self.assertFalse(R('1:ab').is_subrule_of(R('1:a')))
        self.assertFalse(R('1:a').is_subrule_of(R('1:ab')))

        self.assertEqual(R('0:').subtract(R('0:')), R('0:'))
        self.assertEqual(R('2:ab,c').subtract(R('0:')), R('2:ab,c'))
        self.assertEqual(R('2:ab,c').subtract(R('2:ab,c')), R('0:'))
        self.assertRaises(InconsistencyError, lambda: R('2:ab,c').subtract(R('1:ab,c')))
        self.assertRaises(InconsistencyError, lambda: R('1:ab,c').subtract(R('2:ab')))
        self.assertEqual(R('2:ab,c').subtract(R('0:c')), R('2:ab'))
        self.assertEqual(R('2:ab,c').subtract(R('1:ab')), R('1:c'))
        self.assertEqual(R('1:ab,c').subtract(R('1:ab')), R('0:c'))
        # Rule_.subtract() does not enforce subrule relationship

    def test_rule_trivial(self):
        self.assertTrue(R('1:a').is_trivial())
        self.assertTrue(R('1:ab').is_trivial())
        self.assertFalse(R('1:a,b').is_trivial())

    def test_condense_supercells(self):
        def compare(raw_rules, out_rules, supercells):
            rules, cells_ = condense_supercells(raw_rules)
            self.assertEqual(rules, out_rules)
            self.assertEqual(len(cells_), len(set(cells_))) # list of cells should be unique
            self.assertEqual(set(cells_), set(R('0:%s' % supercells).cells_))

        compare([r('0:')], [R('0:')], '')
        compare([r('1:a')], [R('1:a')], 'a')
        compare([r('1:a'), r('1:a')], [R('1:a'), R('1:a')], 'a')
        compare([r('1:a,b')], [R('1:ab')], 'ab')
        compare([r('1:a,b'), r('2:c,d')], [R('1:ab'), R('2:cd')], 'ab,cd')
        compare([r('1:a,b'), r('1:b')], [R('1:a,b'), R('1:b')], 'a,b')
        compare([r('1:a,b'), r('2:b,c')], [R('1:a,b'), R('2:b,c')], 'a,b,c')
        compare([r('1:a,b,c'), r('2:b,c,d')], [R('1:a,bc'), R('2:bc,d')], 'a,bc,d')
        compare([r('1:a,b,c'), r('2:b,c,d'), r('0:c,e')], [R('1:a,b,c'), R('2:b,c,d'), R('0:c,e')], 'a,b,c,d,e')
        compare([r('1:a,b,c'), r('2:b,c,d'), r('0:b,c,e,f')], [R('1:a,bc'), R('2:bc,d'), R('0:bc,ef')], 'a,bc,d,ef')

    def test_rule_reduce_metric(self):
        # supercells don't matter
        self.assertEqual(Reduceable(R('3:a,b,cde'), R('1:a,b')).metric(), Reduceable(R('3:a,b,c,d,e'), R('1:ab')).metric())
        # prefer bigger superrule
        self.assertTrue(Reduceable(R('3:a,b,c,d,e'), R('1:a,b')).metric() > Reduceable(R('3:a,b,c,d'), R('2:b,c,d')).metric())
        # then prefer bigger subrule
        self.assertTrue(Reduceable(R('3:a,b,c,d,e'), R('1:a,b,c')).metric() > Reduceable(R('3:a,b,c,d,e'), R('2:b,c')).metric())
        # then prefer smallest # permutations post-reduction
        self.assertTrue(Reduceable(R('4:a,b,c,d,e,f,g,h'), R('1:a,b,c,d')).metric() > Reduceable(R('4:a,b,c,d,e,f,g,h'), R('2:a,b,c,d')).metric())
        self.assertTrue(Reduceable(R('4:a,b,c,d,e,f,g,h'), R('0:a,b,c,d')).metric() > Reduceable(R('4:a,b,c,d,e,f,g,h'), R('1:a,b,c,d')).metric())
        self.assertEqual(Reduceable(R('4:a,b,c,d,e,f,g,h'), R('1:a,b,c,d')).metric(), Reduceable(R('4:a,b,c,d,e,f,g,h'), R('3:a,b,c,d')).metric())
        self.assertEqual(Reduceable(R('4:a,b,c,d,e,f,g,h'), R('0:a,b,c,d')).metric(), Reduceable(R('4:a,b,c,d,e,f,g,h'), R('4:a,b,c,d')).metric())

    def test_reduce_rules(self):
        self.assertEqual(reduce_rules([R('0:')]), set([]))
        self.assertEqual(reduce_rules([R('1:a')]), set([R('1:a')]))
        self.assertEqual(reduce_rules([R('1:a'), R('1:a')]), set([R('1:a')]))
        self.assertEqual(reduce_rules([R('1:a,b'), R('1:a,c')]), set([R('1:a,b'), R('1:a,c')]))
        self.assertEqual(reduce_rules([R('2:ab,cde,f,g'), R('1:f,g')]), set([R('1:ab,cde'), R('1:f,g')]))
        self.assertEqual(reduce_rules([R('2:a,b,x'), R('1:b'), R('1:b,c')]), set([R('1:a,x'), R('1:b'), R('0:c')]))
        self.assertEqual(reduce_rules([R('2:a,x,y'), R('2:a,b,x'), R('1:b'), R('1:b,c')]), set([R('1:a,x'), R('1:b'), R('0:c'), R('1:y')]))
        self.assertEqual(reduce_rules([R('1:a,b,c,d'), R('0:c,d,e')]), set([R('1:a,b'), R('0:c'), R('0:d'), R('0:e')]))
        self.assertEqual(reduce_rules([R('3:a,b,c,d'), R('3:c,d,e')]), set([R('1:a,b'), R('1:c'), R('1:d'), R('1:e')]))

    # CellRulesMap.overlapping_rules, interference_edges, partition ?

