from django.http import HttpResponse, HttpResponseRedirect, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
import json
import logging
import time
from tasks import minesweeper_solve
from celery.exceptions import TimeLimitExceeded, WorkerLostError
from celery.task.control import revoke
import threading

@csrf_exempt
def api_solve(request):
    payload = json.loads(request.raw_post_data)
    logging.debug('>>' + str(payload))

    start = time.time()
    try:
        result = exec_capped(minesweeper_solve, 5., payload)
    except TimeLimitExceeded:
        result = {'error': 'cpu quota exceeded'}
    logging.debug('celery rtt %.3f' % (time.time() - start))

    logging.debug('<<' + str(result))
    return HttpResponse(json.dumps(result), 'text/json')

def exec_capped(task, time_limit, *args, **kwargs):
    """execute a celery task, but cap execution time at 'time_limit'.
    ideally this would just be a parameter to apply_async, but doesn't
    appear to work. could also change time limits on a per-task basis,
    but that feels too far-reaching; this controls time limit on a
    per-execution basis."""
    _task = executor(task, *args, **kwargs)
    _task.start()
    _task.join(time_limit)
    return _task.resolve()

class executor(threading.Thread):
    """wait for task result in a separate thread, so we can kill it
    if it times out."""
    def __init__(self, task, *args, **kwargs):
        threading.Thread.__init__(self)
        self.invoke = lambda: task.delay(*args, **kwargs)

    def run(self):
        self.invocation = self.invoke()
        try:
            self.result = self.invocation.get()
        except WorkerLostError:
            # happens if task is terminated
            pass

    def terminate(self):
        # kill the corresponding CPU process. THIS IS THE MOST
        # IMPORTANT PART!
        revoke(self.invocation.task_id, terminate=True)

    def resolve(self):
        if self.isAlive():
            self.terminate()
            raise TimeLimitExceeded
        else:
            return self.result
