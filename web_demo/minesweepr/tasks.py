from celery.task import task
import lib.minesweeper as mnsw
import time

@task
def minesweeper_solve(payload):
    try:
        mine_p = payload['mine_prob']
    except KeyError:
        mine_p = mnsw.MineCount(payload['total_cells'], payload['total_mines'])

    rules = [mnsw.Rule(r['num_mines'], r['cells']) for r in payload['rules']]

    result = {}
    start = time.time()
    try:
        result['solution'] = mnsw.solve(rules, mine_p, '_other')
    except mnsw.InconsistencyError:
        result['solution'] = None
    end = time.time()
    result['processing_time'] = end - start

    return result
