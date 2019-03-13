import math
import operator
import collections
from functools import reduce

def fact_div(a, b):
    """return a! / b!"""
    return product(range(b + 1, a + 1)) if a >= b else 1. / fact_div(b, a)

def choose(n, k):
    """return n choose k

    resilient (though not immune) to integer overflow"""
    if n == 1:
        # optimize by far most-common case
        return 1

    return fact_div(n, max(k, n - k)) / math.factorial(min(k, n - k))

def peek(iterable):
    """return an arbitrary item from a collection; no ordering is guaranteed

    useful for extracting singletons, or when you're managing iteration
    yourself"""
    return next(iter(iterable))

def product(n):
    """return the product of a set of numbers

    n -- an iterable of numbers"""
    return reduce(operator.mul, n, 1)

def listify(x):
    """convert object to a list; if not an iterable, wrap as a list of length 1"""
    return list(x) if hasattr(x, '__iter__') else [x]

def graph_traverse(graph, node):
    """graph traversal algorithm -- given a graph and a node, return the set
    of nodes that can be reached from 'node', including 'node' itself""" 
    visited = set()
    def _graph_traverse(n):
        visited.add(n)
        for neighbor in graph[n]:
            if neighbor not in visited:
                _graph_traverse(neighbor)
    _graph_traverse(node)
    return visited

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
    return dict((k, reducefunc(v)) for k, v in mapped.items())

class ImmutableMixin(object):
    """mixin for immutable, hashable objects"""

    def _canonical(self):
        """return the 'core' data of this object in a hashable format, usually a tuple"""
        assert False, 'must override'
    def __eq__(self, o):
        return type(self) == type(o) and self._canonical() == o._canonical()
    def __ne__(self, o):
        return not (self == o)
    def __hash__(self):
        return hash(self._canonical())
