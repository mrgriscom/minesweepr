import unittest
import collections
import re
from minesweeper import *

def sets(o):
    return set_(sets(k) if hasattr(k, '__iter__') else k for k in o)

def r(s):
    """helper function to generate a (raw) Rule"""
    mines, cells = s.split(':')
    cells = cells.split(',') if cells else []
    assert all(len(c) == 1 for c in cells)
    return Rule(int(mines), cells)

def R(s):
    """helper function to generate a Rule_"""
    mines, cells = s.split(':')
    cells = list(map(list, cells.split(','))) if cells else []
    return Rule_.mk(int(mines), cells)

def P(s):
    """helper function to build a permutation"""
    sp = re.split('([0-9]+)', s)
    assert len(sp) % 2 == 1 and not sp[-1]
    return Permutation((frozenset(sp[i]), int(sp[i+1])) for i in range(0, len(sp[:-1]), 2))

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

        # check for lack of exception -- #mines=0 case handled above
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
        # Rule_.subtract() does not enforce subrule relationship, so don't test

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
        # degenerate rules disappear
        self.assertEqual(reduce_rules([R('0:')]), set([]))
        self.assertEqual(reduce_rules([R('1:a')]), set([R('1:a')]))
        # duplicate rules disappear
        self.assertEqual(reduce_rules([R('1:a'), R('1:a')]), set([R('1:a')]))
        self.assertEqual(reduce_rules([R('1:a,b'), R('1:a,c')]), set([R('1:a,b'), R('1:a,c')]))
        self.assertEqual(reduce_rules([R('2:ab,cde,f,g'), R('1:f,g')]), set([R('1:ab,cde'), R('1:f,g')]))
        self.assertEqual(reduce_rules([R('2:a,b,x'), R('1:b'), R('1:b,c')]), set([R('1:a,x'), R('1:b'), R('0:c')]))
        # chained reduction
        self.assertEqual(reduce_rules([R('2:a,x,y,z'), R('2:a,b,x'), R('1:b'), R('1:b,c')]), set([R('1:a,x'), R('1:b'), R('0:c'), R('1:y,z')]))
        # decomposition then reduction
        self.assertEqual(reduce_rules([R('1:a,b,c,d'), R('0:c,d,e')]), set([R('1:a,b'), R('0:c'), R('0:d'), R('0:e')]))
        self.assertEqual(reduce_rules([R('3:a,b,c,d'), R('3:c,d,e')]), set([R('1:a,b'), R('1:c'), R('1:d'), R('1:e')]))

    def test_permute(self):
        pset = lambda r: PermutationSet.from_rule(r).permus

        self.assertEqual(pset(R('0:')), set([P('')]))
        self.assertEqual(pset(R('0:a')), set([P('a0')]))
        self.assertEqual(pset(R('1:a')), set([P('a1')]))
        self.assertEqual(pset(R('0:abc')), set([P('abc0')]))
        self.assertEqual(pset(R('1:abc')), set([P('abc1')]))
        self.assertEqual(pset(R('2:abc')), set([P('abc2')]))
        self.assertEqual(pset(R('3:abc')), set([P('abc3')]))
        self.assertEqual(pset(R('0:a,b,c')), set([P('a0b0c0')]))
        self.assertEqual(pset(R('1:a,b,c')), set([P('a1b0c0'), P('a0b1c0'), P('a0b0c1')]))
        self.assertEqual(pset(R('2:a,b,c')), set([P('a1b1c0'), P('a1b0c1'), P('a0b1c1')]))
        self.assertEqual(pset(R('3:a,b,c')), set([P('a1b1c1')]))
        self.assertEqual(pset(R('0:abc,de,f')), set([P('abc0de0f0')]))
        self.assertEqual(pset(R('1:abc,de,f')), set([P('abc1de0f0'), P('abc0de1f0'), P('abc0de0f1')]))
        self.assertEqual(pset(R('3:abc,de,f')), set([P('abc3de0f0'), P('abc2de1f0'), P('abc2de0f1'), P('abc1de2f0'), P('abc1de1f1'), P('abc0de2f1')]))
        self.assertEqual(pset(R('5:abc,de,f')), set([P('abc3de2f0'), P('abc3de1f1'), P('abc2de2f1')]))
        self.assertEqual(pset(R('6:abc,de,f')), set([P('abc3de2f1')]))

    def test_permutation_subset(self):
        self.assertEqual(P('abc2de1f0').subset(R('0:abc,de').cells_), P('abc2de1'))
        self.assertEqual(P('abc2de1f0').subset(R('0:f').cells_), P('f0'))
        self.assertEqual(P('abc2de1f0').subset(R('0:').cells_), P(''))

    def test_permutation_compatible_and_combine(self):
        self.assertTrue(P('').compatible(P('')))
        self.assertTrue(P('a0').compatible(P('')))
        self.assertTrue(P('a0').compatible(P('a0')))
        self.assertTrue(P('a1').compatible(P('a1')))
        self.assertTrue(P('a0').compatible(P('b1')))
        self.assertFalse(P('a0').compatible(P('a1')))
        self.assertTrue(P('abc2de1f0').compatible(P('abc2de1ghi2')))
        self.assertFalse(P('abc1de1f0').compatible(P('abc2de1ghi2')))

        self.assertEqual(P('').combine(P('')), P(''))
        self.assertEqual(P('a0').combine(P('')), P('a0'))
        self.assertEqual(P('a0').combine(P('a0')), P('a0'))
        self.assertEqual(P('a1').combine(P('a1')), P('a1'))
        self.assertEqual(P('a0').combine(P('b1')), P('a0b1'))
        self.assertEqual(P('abc2de1f0').combine(P('abc2de1ghi2')), P('abc2de1f0ghi2'))

    def test_permutation_multiplicity(self):
        self.assertEqual(P('a0b1c0d1').multiplicity(), 1)
        self.assertEqual(P('ab0def3ghij0k1').multiplicity(), 1)
        self.assertEqual(P('ab0def1ghij0k1').multiplicity(), 3)
        self.assertEqual(P('ab0def1ghij2k1').multiplicity(), 18)

    def test_permutationset_decompose(self):
        _ = lambda it: set(ps._immutable() for ps in it)

        pset = PermutationSet.from_rule(R('2:a,b,c,d'))
        self.assertEqual(_(pset.decompose()), _([pset]))
        pset.remove(P('a1b1c0d0'))
        self.assertEqual(_(pset.decompose()), _([pset]))
        pset.remove(P('a0b0c1d1'))
        self.assertEqual(_(pset.decompose()), _([
                    PermutationSet.from_rule(R('1:a,b')),
                    PermutationSet.from_rule(R('1:c,d')),
        ]))
        pset.remove(P('a1b0c0d1'))
        self.assertEqual(_(pset.decompose()), _([pset]))
        pset.remove(P('a0b1c0d1'))
        self.assertEqual(_(pset.decompose()), _([
                    PermutationSet.from_rule(R('1:a,b')),
                    PermutationSet.from_rule(R('1:c')),
                    PermutationSet.from_rule(R('0:d')),
        ]))
        pset.remove(P('a0b1c1d0'))
        self.assertEqual(_(pset.decompose()), _([
                    PermutationSet.from_rule(R('1:a')),
                    PermutationSet.from_rule(R('0:b')),
                    PermutationSet.from_rule(R('1:c')),
                    PermutationSet.from_rule(R('0:d')),
        ]))

        pset = PermutationSet.from_rule(R('4:ab,c,d,ef,g,h'))
        subset1 = PermutationSet.from_rule(R('2:ab,c,d'))
        subset2 = PermutationSet.from_rule(R('2:ef,g,h'))
        for p in list(pset.permus):
            if not any(p.compatible(sp) for sp in subset1.permus):
                pset.remove(p)
        self.assertEqual(_(pset.decompose()), _([subset1, subset2]))
        # decomposed rulesets can still have constrained permutation sets
        subset1.remove(P('ab2c0d0'))
        for p in list(pset.permus):
            if p.compatible(P('ab2c0d0')):
                pset.remove(p)
        self.assertEqual(_(pset.decompose()), _([subset1, subset2]))
        subset2.remove(P('ef1g0h1'))
        for p in list(pset.permus):
            if p.compatible(P('ef1g0h1')):
                pset.remove(p)
        self.assertEqual(_(pset.decompose()), _([subset1, subset2]))

    def test_ruleset_cross_eliminate_and_rereduce(self):
        def compare(rules, output, rereduced=None):
            _ = lambda prs: set(set_(ps.permus) for ps in prs.permu_map.values())

            prs = PermutedRuleset(set(rules))
            prs.cross_eliminate()
            if output is not None:
                self.assertEqual(_(prs), sets(output))
            prs.rereduce()
            if rereduced is not None:
                self.assertEqual(_(prs), sets(rereduced))

        # rules constrained due to overlap
        compare([R('1:a,b,c'), R('2:b,c,d')],
                [[P('a0b1c0'), P('a0b0c1')], [P('b1c0d1'), P('b0c1d1')]],
                [[P('a0')], [P('b1c0'), P('b0c1')], [P('d1')]])
        # constraining causes further cascade
        compare([R('2:a,b,c'), R('1:b,c,d'), R('1:c,d,e'), R('1:d,e,f'), R('1:e,f,g')],
                [[P('a1b1c0'), P('a1b0c1')],
                 [P('b1c0d0'), P('b0c1d0')],
                 [P('c1d0e0'), P('c0d0e1')],
                 [P('d0e1f0'), P('d0e0f1')],
                 [P('e1f0g0'), P('e0f1g0')],
                ],
                [[P('a1')], [P('b1c0'), P('b0c1')], [P('c1e0'), P('c0e1')], [P('d0')], [P('e1f0'), P('e0f1')], [P('g0')]])
        # rule loop determines all mines (in a way that reduce_rules could not)
        compare([
                R('2:a,b,c,s,t'),
                R('2:b,c,d'),
                R('2:c,d,e'),
                R('2:d,e,f,g,h'),
                R('2:g,h,i'),
                R('2:h,i,j'),
                R('2:i,j,k,l,m'),
                R('2:l,m,n'),
                R('2:m,n,o'),
                R('2:n,o,p,q,r'),
                R('2:q,r,s'),
                R('2:r,s,t'),
            ], [
                [P('a0b0c1s1t0')],
                [P('b0c1d1')],
                [P('c1d1e0')],
                [P('d1e0f0g0h1')],
                [P('g0h1i1')],
                [P('h1i1j0')],
                [P('i1j0k0l0m1')],
                [P('l0m1n1')],
                [P('m1n1o0')],
                [P('n1o0p0q0r1')],
                [P('q0r1s1')],
                [P('r1s1t0')],
            ], [
                [P('a0')], [P('b0')], [P('c1')], [P('d1')], [P('e0')],
                [P('f0')], [P('g0')], [P('h1')], [P('i1')], [P('j0')],
                [P('k0')], [P('l0')], [P('m1')], [P('n1')], [P('o0')],
                [P('p0')], [P('q0')], [P('r1')], [P('s1')], [P('t0')]])
        # impossible configurations
        prs = PermutedRuleset([R('1:a,b,c'), R('2:b,c,d'), R('2:a,b,d'), R('2:a,c,d')])
        self.assertRaises(InconsistencyError, lambda: prs.cross_eliminate())
        prs = PermutedRuleset([R('1:a,b,c,d'), R('3:b,c,d,e')])
        self.assertRaises(InconsistencyError, lambda: prs.cross_eliminate())
        # more complex re-reductions
        compare([R('2:a,b,c,d'), R('1:a,b,x'), R('1:c,d,y')], None,
                [[P('a1b0'), P('a0b1')], [P('c1d0'), P('c0d1')], [P('x0')], [P('y0')]])
        compare([R('3:a,b,c,d,e,f'), R('1:e,f,y'), R('2:a,b,c,d,x'), R('1:x,k,l'), R('2:k,l,m'), R('1:b,c,q')], None,
                [[P('a1b1c0d0'), P('a1b0c1d0'), P('a1b0c0d1'), P('a0b1c0d1'), P('a0b0c1d1')],
                 [P('b1c0q0'), P('b0c1q0'), P('b0c0q1')], 
                 [P('e1f0'), P('e0f1')], [P('k1l0'), P('k0l1')], [P('x0')], [P('y0')], [P('m1')]])

    def test_partition(self):
        # TODO basic cases


        _ = lambda prs: set(ps._immutable()[2] for ps in prs.permu_map.values())

        prs = permute_and_interfere(set([R('3:a,b,c,d,e,f'), R('1:e,f,y'), R('2:a,b,c,d,x'), R('1:x,k,l'), R('2:k,l,m'), R('1:b,c,q')]))
        fronts = prs.split_fronts()
        self.assertEqual(sets(map(_, fronts)), sets([
                    [
                        [P('a1b1c0d0'), P('a1b0c1d0'), P('a1b0c0d1'), P('a0b1c0d1'), P('a0b0c1d1')],
                        [P('b1c0q0'), P('b0c1q0'), P('b0c0q1')]
                    ], 
                    [[P('e1f0'), P('e0f1')]],
                    [[P('k1l0'), P('k0l1')]],
                    [[P('x0')]],
                    [[P('y0')]],
                    [[P('m1')]]
                ]))




    # enumerate
    # trivial front?


    def test_uncharted_cell(self):
        c = UnchartedCell(0)
        self.assertEqual(len(c), 0)
        self.assertEqual(list(c), [])
        c = UnchartedCell(50)
        self.assertEqual(len(c), 50)
        self.assertEqual(list(c), [None])


if __name__ == '__main__':
    unittest.main()
