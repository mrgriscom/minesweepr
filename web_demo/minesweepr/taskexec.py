import threading
from subprocess import Popen, PIPE
import sys
import json as ser
import os
import os.path

class ExecTimeOut(Exception):
    pass

def exec_capped(task, time_limit, *args, **kwargs):
    """execute a task, but cap execution time at 'time_limit'"""
    if time_limit is None:
        # run inline for debugging purposes
        return task(*args, **kwargs)
    
    _task = executor(task, *args, **kwargs)
    _task.start()
    _task.join(time_limit)
    return _task.resolve()

class executor(threading.Thread):
    """wait for task result in a separate thread, so we can kill it
    if it times out."""
    def __init__(self, task, *args, **kwargs):
        threading.Thread.__init__(self)

        self.taskname = '%s.%s' % (task.__module__, task.__name__)
        self.args = args
        self.kwargs = kwargs

    def start(self):
        project_root = filter(lambda p: p, sys.path)[0] # sketchy
        self.p = Popen(['python', os.path.join(os.getcwd(), __file__)], cwd=project_root, stdin=PIPE, stdout=PIPE, stderr=PIPE)

        threading.Thread.start(self)

    def run(self):
        payload = {'task': self.taskname, 'args': self.args, 'kwargs': self.kwargs}
        try:
            out, err = self.p.communicate(ser.dumps(payload))
            self.result = ((False, err) if err else (True, ser.loads(out)))
        except:
            # various errors if process is terminated
            pass

    def terminate(self):
        try:
            self.p.terminate()
        except OSError:
            # if process completes before we terminate
            pass
        self.p.wait()

    def resolve(self):
        if self.isAlive():
            self.terminate()
            raise ExecTimeOut
        else:
            success, result = self.result
            if success:
                return result
            else:
                raise Exception('error in task> ' + result)

def _exec(payload):
    taskname = payload['task']
    module = '.'.join(taskname.split('.')[:-1])
    method = taskname.split('.')[-1]

    func = getattr(__import__(module, fromlist=[method]), method)
    return func(*payload['args'], **payload['kwargs'])
    #exception will dump to stderr

if __name__ == "__main__":
    sys.path.insert(0, os.getcwd()) # cwd set to django project root dir
    print ser.dumps(_exec(ser.load(sys.stdin)))
