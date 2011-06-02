import sys
from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler
from SocketServer import ThreadingMixIn
import threading
import logging
import time
import json
import minesweeper as m


logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)

DEFAULT_PORT = 4444

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    pass

class MinesweeperGateway(threading.Thread):
    def __init__(self, port):
        threading.Thread.__init__(self)
        self.server = ThreadingHTTPServer(('', port), Handler)

    def run(self):
        self.server.serve_forever()

    def terminate(self):
        self.server.shutdown()

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):

        if 'content-length' in self.headers.dict:
            length = int(self.headers.dict['content-length'])
        else:
            logging.warn('content length required')
            self.send_error(400, 'content length required for post')
            return

        if 'content-type' not in self.headers.dict or self.headers.dict['content-type'] != 'text/json':
            logging.warn('content type missing or non-json')

        body = self.rfile.read(length)
        try:
            logging.debug('received: [%s]' % body)
            data_in = json.loads(body)
        except:
            logging.warn('content does not parse')
            self.send_error(400, 'content does not parse as valid json')
            return

        try:
            data_out = handle_request(data_in)
        except Exception, e:
            logging.exception('error handling request')
            self.send_error(500, 'internal error handling request: %s: %s' % (type(e), str(e)))
            return

        reply = json.dumps(data_out)

        self.send_response(200)
        self.send_header('Content-Type', 'text/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(reply.encode('utf-8'))
        logging.debug('returned: [%s]' % reply)

    # stupid same-origin policy
    def do_GET(self):
        import os.path
        path = os.path.join(os.path.dirname(__file__), '.' + self.path)
        try:
            with open(path) as f:
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(f.read())
        except:
            self.send_response(404)
            self.end_headers()

def handle_request (content, **kwargs):
    if 'mine_prob' in content:
        mine_p = content['mine_prob']
    else:
        mine_p = m.MineCount(content['total_cells'], content['total_mines'])

    rules = [m.Rule(r['num_mines'], r['cells']) for r in content['rules']]

    result = dict(m.solve(rules, mine_p))
    if '' in result:
        result['_other'] = result['']
        del result['']
    return result

if __name__ == "__main__":

    try:
        port = int(sys.argv[1])
    except IndexError:
        port = DEFAULT_PORT

    gw = MinesweeperGateway(port)
    gw.start()
    logging.info('started server on port %d' % port)

    try:
        while True:
            time.sleep(.01) #yield thread
    except KeyboardInterrupt:
        logging.info('interrupted; shutting down...')
        gw.terminate()
