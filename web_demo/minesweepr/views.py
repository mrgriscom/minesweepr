from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
from django.template import RequestContext
from django.shortcuts import render_to_response
import json
import logging
import time
from tasks import minesweeper_solve
from taskexec import exec_capped, ExecTimeOut

@csrf_exempt
def api_solve(request):
    payload = json.loads(request.raw_post_data)
    logging.debug('>>' + str(payload))

    start = time.time()
    try:
        result = exec_capped(minesweeper_solve, 5., payload)
    except ExecTimeOut:
        result = {'error': 'cpu quota exceeded'}
    logging.debug('task queue rtt %.3f' % (time.time() - start))

    logging.debug('<<' + str(result))
    return HttpResponse(json.dumps(result), 'text/json')

def template_static(request):
    return render_to_response(request.path[1:], {}, context_instance=RequestContext(request))
