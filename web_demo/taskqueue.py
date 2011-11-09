from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler
from SocketServer import ThreadingMixIn
import multiprocessing as mp
import threading
import Queue
import sys
import json
import itertools
from optparse import OptionParser
import time
import logging
import os

def f(x):
    a = sum(xrange(1, x))
    return '-%d-' % x

#todo: actually call 'func'
def eval_task(func, args, kwargs):
    try:
        return (True, f(*args, **kwargs))
    except Exception, e:
        return (False, '%s %s' % (type(e), str(e)))

def worker_loop(conn):
    while True:
        job_id, func, args, kwargs = conn.recv()

        def _log(action, args):
            logging.debug('worker %s %s task %d: %s' % (os.getpid(), action, job_id, str(args)))

        _log('starting', (func, args, kwargs))
        success, result = eval_task(func, args, kwargs)
        _log('completed', (success, result))
        conn.send((job_id, success, result))

class PendingTask(object):
    def __init__(self, callback, time_limit):
        self.cb = callback
        self.time_limit = time_limit
        self.received_at = time.time()
        self.worker = None

    def expiry(self):
        return self.received_at + self.time_limit if self.time_limit is not None else None

    def is_expired(self):
        if self.expiry() is None:
            return False
        else:
            return time.time() > self.expiry()

    def callback(self, status, result):
        self.cb(status, result, time.time() - self.received_at)

class Worker(threading.Thread):
    def __init__(self, pool, resultq):
        threading.Thread.__init__(self)
        self.daemon = True
        self.up = True

        self.pool = pool
        self.resultq = resultq
        self.conn, self.remote = mp.Pipe()
        self.w = mp.Process(target=worker_loop, args=[self.remote])
        self.w.daemon = True

        self.cur_job = None

    def start(self):
        threading.Thread.start(self)
        self.w.start()

    def terminate(self):
        """terminate this worker thread and its associated process"""
        self.up = False
        self.remote.close()
        self.w.terminate()

    def run(self):
        """main loop; get jobs, hand them to worker process, handle
        responses"""
        while self.up:
            task = self.pool.get_job(self)
            if not task:
                continue

            self.conn.send(task)
            try:
                while not self.conn.poll(.01):
                    if not self.up:
                        raise EOFError
                resp = self.conn.recv()
            except EOFError:
                continue
            self.pool.relinquish_job(self)
            self.resultq.put(resp)
        self.conn.close()
        logging.debug('worker thread terminated')

class Pool(threading.Thread):
    def __init__(self, num_workers):
        threading.Thread.__init__(self)
        # lock for task list / task metadata. required whenever accessing:
        # - pending task list (self.pending)
        # - current worker for a given task
        # - current task for a given worker
        self.lock = threading.RLock()
        self.daemon = True

        self.num_workers = num_workers
        self.job_counter = 0
        self.pending = {} # mapping of job id -> job metadata for pending jobs

        self.jobq = mp.Queue()    #new tasks submitted here for processing
        self.resultq = mp.Queue() #task results submitted here for processing
        self.workers = []

    def start(self):
        threading.Thread.start(self)
        for i in range(self.num_workers):
            self.new_worker()

    def apply_async(self, callback, func, args=[], kwargs={}, time_limit=None):
        """submit a task for execution; allow up to 'time_limit' to finish; provide
        result via callback function"""
        job_id = self.new_job(callback, time_limit)
        logging.debug('new task %d: %s' % (job_id, str((func, args, kwargs, time_limit))))
        self.jobq.put((job_id, func, args, kwargs))

    def apply(self, func, args=[], kwargs={}, time_limit=None):
        """see apply_async, but block until result is available"""
        val = []
        cond = threading.Condition()

        def callback(*args):
            with cond:
                val.append(args)
                cond.notify()

        cond.acquire()
        self.apply_async(callback, func, args, kwargs, time_limit)
        cond.wait()
        return val[0]

    def run(self):
        """main thread -- processes results from workers and timed-out tasks"""
        while True:
            try:
                job_id, success, result = self.resultq.get(timeout=0.01)
                self.respond(job_id, success, result)
            except Queue.Empty:
                self.purge_stale()

    def respond(self, job_id, success, result):
        """handle response for a task result completed under normal circumstances"""
        task = self.pop_job(job_id)
        if task is None:
            # too late; already expired
            logging.debug('received result for job %d already expired' % job_id)
            return

        status = {True: 'success', False: 'exception'}[success]
        logging.debug('task %d complete: %s' % (job_id, str((status, result))))
        task.callback(status, result)

    def purge_stale(self):
        """handle expired tasks"""
        for job_id, task in self.stale_jobs().iteritems():
            logging.debug('task %d timed out' % job_id)
            task.callback('timeout', None)
            self.kill_task(job_id, task)

    def kill_task(self, job_id, task):
        """kill the worker currently executing an expired task (if any),
        and spawn a new worker in its place"""
        with self.lock:
            worker = task.worker
            if worker and worker.cur_job == job_id:
                logging.debug('expired task still being processed; killing worker %d' % worker.w.pid)
                worker.terminate()
                self.new_worker()

    def new_job(self, callback, time_limit):
        """create a pending task entry for a newly-received task"""
        with self.lock:
            job_id = self.job_counter
            self.job_counter += 1
            self.pending[job_id] = PendingTask(callback, time_limit)
            return job_id

    def pop_job(self, job_id):
        """pop a completed/expired task from the pending tasks table"""
        with self.lock:
            try:
                task = self.pending[job_id]
                del self.pending[job_id]
                return task
            except KeyError:
                # can happen when a response for this task is in the result queue
                # but we already expired it before we could process
                return None

    def stale_jobs(self):
        """pop and return all tasks that have expired"""
        with self.lock:
            stale_ids = [job_id for job_id, task in self.pending.iteritems() if task.is_expired()]
            return dict((job_id, self.pop_job(job_id)) for job_id in stale_ids)

    def get_job(self, worker):
        """called by worker thread to get new jobs to execute"""
        task = self.jobq.get()
        with self.lock:
            if not worker.up:
                # this worker is being terminated (though apparently we still
                # completed the task that triggered our termination)
                # return this job to the queue for another worker to handle
                self.jobq.put(task)
                return None

            claimed = self.claim_job(task[0], worker)
            if not claimed:
                # task is already expired
                return None

            return task

    def claim_job(self, job_id, worker):
        """register that a given task is being handled by a worker.
        once run, this task is officially being run by the given
        worker; no other worker will handle it and terminating this
        worker will abort the task (though in rare cases the task will
        complete before the termination takes effect

        specified job may not exist if already expired; return whether
        the task should actually be executed"""
        with self.lock:
            try:
                task = self.pending[job_id]
            except KeyError:
                return False

            task.worker = worker
            worker.cur_job = job_id
            return True

    def relinquish_job(self, worker):
        """officially indicate that the task has been completed by the worker"""
        with self.lock:
            worker.cur_job = None

    def new_worker(self):
        """create and start a new worker"""
        worker = Worker(self, self.resultq)
        self.workers.append(worker)
        worker.start()
        logging.debug('spawning new worker')

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    pass

class TaskQueueHTTPGateway(threading.Thread):
    def __init__(self, port, pool):
        threading.Thread.__init__(self)
        self.server = ThreadingHTTPServer(('', port), TaskRequestHandler)
        self.server.pool = pool

    def run(self):
        self.server.serve_forever()

    def terminate(self):
        self.server.shutdown()

class TaskRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        """handle request -- synchronously wait for result, since python
        http server is a 1 thread per request architecture"""
        try:
            try:
                func, args, kwargs, time_limit = self.parse_args()
            except Exception, e:
                self.send_error(*e.args)
                return

            status, result, runtime = self.server.pool.apply(func, args, kwargs, time_limit)

            self.send_response(200)
            self.send_header('Content-Type', 'text/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': status, 'result': result, 'runtime': runtime}))
        except Exception, e:
            logging.exception('unexpected error')
            self.send_error(500, '%s %s' % (type(e), str(e)))

        print 'done, right?'

    def parse_args(self):
        """parse request payload"""
        try:
            length = int(self.headers.dict['content-length'])
        except KeyError:
            raise Exception(400, 'content length required')

        raw_payload = self.rfile.read(length)

        try:
            payload = json.loads(raw_payload)
        except ValueError:
            raise Exception(400, 'invalid json body')

        try:
            func = payload['method']
            args = payload.get('args', [])
            kwargs = payload.get('kwargs', {})
            time_limit = payload.get('time_limit')
        except KeyError:
            raise Exception(400, 'missing required arguments')

        return func, args, kwargs, time_limit

def parse_options():
    """parse command line options"""
    parser = OptionParser()
    parser.add_option("-p", "--port", dest="port", type='int', default=9690)
    parser.add_option("-w", "--workers", dest="num_workers", type='int', default=3)
    (options, args) = parser.parse_args()
    return options

if __name__ == "__main__":
    logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)-15s %(levelname)s %(message)s')

    opts = parse_options()

    pool = Pool(opts.num_workers)
    pool.start()
    logging.info('process pool started with %d workers' % opts.num_workers)

    # also proof-of-concept'ed with tornado, but requests were getting dropped
    # under high load. python http server spawns a thread for each request, but
    # i think that's acceptable
    gw = TaskQueueHTTPGateway(opts.port, pool)
    gw.start()
    logging.info('gateway started on port %d' % opts.port)

    try:
        while True:
            time.sleep(.01) #yield thread
    except KeyboardInterrupt:
        logging.info('shutting down...')
        gw.terminate()
