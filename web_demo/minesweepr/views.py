from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
from django.template import RequestContext
from django.shortcuts import render_to_response
from django.conf import settings
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
        result = exec_capped(minesweeper_solve, settings.CPU_QUOTA, payload)
    except ExecTimeOut:
        result = {'error': 'cpu quota exceeded'}
    logging.info('task queue rtt %.3f' % (time.time() - start))

    logging.debug('<<' + str(result))
    return HttpResponse(json.dumps(result), 'text/json')

def template_static(request):
    url = request.path[1:-1]
    assert url.startswith(settings.BASE_STATIC_URL)
    template = url[len(settings.BASE_STATIC_URL):] + '.html'
    return render_to_response(template, {}, context_instance=RequestContext(request))
