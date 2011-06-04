from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
import json
import minesweeper.lib.minesweeper as mnsw

@csrf_exempt
# TODO: since solving uses an exponential-time algorithm, requests can easily DoS
# the CPU; impose a resource limit somehow?
def api_solve(request):
    payload = json.loads(request.raw_post_data)
    result = minesweeper_solve(payload)
    return HttpResponse(json.dumps(result), 'text/json')

def minesweeper_solve(payload):
    try:
        mine_p = payload['mine_prob']
    except KeyError:
        mine_p = mnsw.MineCount(payload['total_cells'], payload['total_mines'])

    rules = [mnsw.Rule(r['num_mines'], r['cells']) for r in payload['rules']]

    result = {}
    try:
        result['solution'] = mnsw.solve(rules, mine_p, '_other')
    except mnsw.InconsistencyError:
        result['solution'] = None

    return result
