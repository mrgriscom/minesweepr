from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
import json
import logging
import time
from tasks import minesweeper_solve

@csrf_exempt
# TODO: since solving uses an exponential-time algorithm, requests can easily DoS
# the CPU; impose a resource limit somehow?
def api_solve(request):
    payload = json.loads(request.raw_post_data)
    logging.debug('>>' + str(payload))

    start = time.time()
    result = minesweeper_solve.delay(payload).get()
    logging.debug('celery rtt %.3f' % (time.time() - start))

    logging.debug('<<' + str(result))
    return HttpResponse(json.dumps(result), 'text/json')

