from flask import escape, Response
import json
import time
import minesweeper as mnsw
from minesweeper_util import api_solve

def solve(request):
    # CORS-enable
    if request.method == 'OPTIONS':
        return ('', 204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': '*',
        })
    
    request_json = request.get_json(force=True, silent=True)
    request_args = request.args

    if request_json:
        payload = request_json
    else:
        payload = json.loads(request_args['json'])

    result = api_solve(payload)
    resp = Response(json.dumps(result), mimetype='text/json')
    resp.headers.set('Access-Control-Allow-Origin', '*')
    return resp

def asdf(request):
    import os
    os.environ['FUNCTION_TIMEOUT_SEC']

    
    return repr(os.environ)

def timeout(request):
    from urllib.request import urlopen
    try:
        urlopen('http://mrgris.com/hellohello').read()
    except:
        pass
    
    time.sleep(20)
    return 'timeout'

def exception(request):
    raise RuntimeError('fuck')
