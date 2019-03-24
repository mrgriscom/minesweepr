from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
from django.template import RequestContext
from django.shortcuts import render_to_response
from django.conf import settings
import json
import logging
import time
from taskexec import exec_capped, ExecTimeOut
import itertools

@csrf_exempt
def api_solve(request):
    payload = json.loads(request.raw_post_data)
    logging.debug('>>' + str(payload))

    start = time.time()
    try:
        from lib.minesweeper_util import api_solve
        result = exec_capped(api_solve, settings.CPU_QUOTA, payload)
    except ExecTimeOut:
        result = {'error': 'cpu quota exceeded'}
    log_result(payload, result, time.time() - start)

    logging.debug('<<' + str(result))
    return HttpResponse(json.dumps(result), 'text/json')

def log_result(payload, result, rtt):
    num_rules = len(payload['rules'])
    num_uniq_cells = len(set(itertools.chain(*(r['cells'] for r in payload['rules']))))
    avg_cells_per_rule = sum(len(r['cells']) for r in payload['rules']) / float(num_rules) if num_rules else 0.

    try:
        solved_in = '%.3f' % result['processing_time']
    except KeyError:
        solved_in = '--'

    logging.info('%d rules %d cells %.1f avg cpr; solved in %s, task queue rtt %.3f' %
                 (num_rules, num_uniq_cells, avg_cells_per_rule, solved_in, rtt))

def template_static(request):
    url = request.path[1:-1]
    assert url.startswith(settings.BASE_STATIC_URL)
    template = url[len(settings.BASE_STATIC_URL):] + '.html'
    return render_to_response(template, {}, context_instance=RequestContext(request))
