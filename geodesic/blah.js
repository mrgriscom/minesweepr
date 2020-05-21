$(document).ready(function() {
    /*
    var N = 11;
    var i = 0;
    setInterval(function() {
        draw(N, i);
        i = (i+1)%N;
    }, 100);
*/
    
    //draw(1, 0);

    //blah();
});


function skew_tx(N, c) {
    var b = N - c;
    return invert_transform([b, -c], [c, b+c]);
}

EPSILON = 1e-6

function blahh(N, c) {
    var canvas = $('#canvas')[0];
    var ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(1, -1);
    ctx.translate(0, -canvas.height);
    ctx.scale(200, 200);
    ctx.translate(1.1, .66);
    
    ctx.transform(1, 0, -.5, .5*Math.sqrt(3), 0, 0); 

    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 5; x++) {
            tri(ctx, x, y, true);
            tri(ctx, x, y+1, false);
        }
    }

    //blah(N, c, true, ctx);
    blah(N, c, false, ctx);
    
}

function blah(N, c, HEX, ctx) {
    
    var sktx = skew_tx(N, c);
    var tx = function(x, y) { return transform([x, y], sktx[0], sktx[1]); }
    var faces = gen_faces(N, c, HEX);
    console.log(faces.length);
    $.each(faces, function(i, f) {
        if (HEX) {
            var v0 = tx(f.x + .666, f.y + .333);
            var v1 = tx(f.x + .333, f.y - .333);
            var v2 = tx(f.x - .333, f.y - .666);
            var v3 = tx(f.x - .666, f.y - .333);
            var v4 = tx(f.x - .333, f.y + .333);
            var v5 = tx(f.x + .333, f.y + .666);
            ctx.beginPath();
            ctx.moveTo(v0[0], v0[1]);
            ctx.lineTo(v1[0], v1[1]);
            ctx.lineTo(v2[0], v2[1]);
            ctx.lineTo(v3[0], v3[1]);
            ctx.lineTo(v4[0], v4[1]);
            ctx.lineTo(v5[0], v5[1]);
            ctx.closePath();
        } else {
            var v0 = tx(f.x, f.y);
            var v1 = tx(f.x + 1, f.y + 1);
            var v2 = tx(f.x + (f.top ? 0 : 1), f.y + (f.top ? 1 : 0));
            ctx.beginPath();
            ctx.moveTo(v0[0], v0[1]);
            ctx.lineTo(v1[0], v1[1]);
            ctx.lineTo(v2[0], v2[1]);
            ctx.closePath();
        }
        
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'hsl(' + 360*f.face/19*3 + ', 50%, 80%, 40%)';

        ctx.lineWidth = 0.005;
        ctx.fill();
        ctx.stroke();
        
        //dot(ctx, xy[0], xy[1], f.face);
    });


}

function gen_faces(N, c, HEX) {
    var xmin = 0;
    var xmax = 0;
    var ymin = 0;
    var ymax = 0;

    var sktx = skew_tx(N, c);
    var isktx = invert_transform(sktx[0], sktx[1]);
    $.each([0, 3], function(_, y) {
        $.each([0, 5], function(_, x) {
            var p = transform([x, y], isktx[0], isktx[1]);
            xmin = Math.min(xmin, p[0]);
            xmax = Math.max(xmax, p[0]);
            ymin = Math.min(ymin, p[1]);
            ymax = Math.max(ymax, p[1]);
        });
    });

    var faces = [];

    var n = (HEX ? 1 : 2);
    for (var y = ymin; y < ymax; y++) {
        for (var x = xmin; x < xmax; x++) {
            for (var i = 0 ; i < n; i++) {
                var f = assign_to_face([x, y], i, sktx);
                if (f != null && f.f >= 0) {
                    faces.push({face: f.f, x: f.x, y: f.y, top: i == 1});
                }
            }
        }
    }
    console.log((xmax - xmin + 1) * (ymax - ymin + 1) / (3*N+1) / (5*N+1));

    return faces;
}

function _face(xy) {
    var x = xy[0];
    var y = xy[1];
    var ix = Math.floor(x + EPSILON);
    var iy = Math.floor(y + EPSILON);
    var fx = x - ix;
    var fy = y - iy;

    var vertex = (fx < EPSILON && fy < EPSILON);
    var top = fy > fx + EPSILON;
    return {x: ix, y: iy, top: top, vertex: vertex};
}

function assign_to_face(xy, n, sktx) {
    // in tri mode, centers can't land on vertices
    // in hex mode, vertices should be ignored -- handled as a separate 'meta-face'?

    var offsets = {
        'center': [[2/3., 1/3.], [1/3., 2/3.]][n],
        'right': [[.5, 0], [.5, 1.]][n],
        'bottom': [[.5, .5], [.5, .5]][n],
        'hypot': [[1., .5], [0, .5]][n],
    };
    
    var baseline = transform([xy[0]+offsets.center[0], xy[1]+offsets.center[1]], sktx[0], sktx[1]);
    var r = _face(baseline);
    $.each(['right', 'bottom', 'hypot'], function(i, e) {
        var ref = transform([xy[0]+offsets[e][0], xy[1]+offsets[e][1]], sktx[0], sktx[1]);
        var r2 = _face(ref);

        var diff = null;
        if (r2.x != r.x && r2.y == r.y) {
            diff = 'right';
        } else if (r2.x == r.x && r2.y != r.y) {
            diff = 'bottom';
        } else if (r2.x == r.x && r2.y == r.y && r.top != r2.top) {
            diff = 'hypot';
        }
        if (diff == e) {
            r = r2;
            return false; // break
        }
    });
        
    /* hex only
    if (r.vertex) {
        return -1;
    }
    */
    var f = null;
    if (r.x >= 0 && r.x < 5) {
        if (r.y == 2 && !r.top) {
            f = r.x;
        } else if (r.y == 1) {
            f = 5 + 2*r.x + (r.top ? 0 : 1);
        } else if (r.y == 0 && r.top) {
            f = 15 + r.x;
        }
    }
    if (f == null) {
        return null;
    } else {
        return {f:f, x:xy[0], y:xy[1]};
    }
}

function transform(p, U, V) {
    return [p[0] * U[0] + p[1] * V[0], p[0] * U[1] + p[1] * V[1]];
}

function invert_transform(U, V) {
    var det = 1./(U[0]*V[1]-U[1]*V[0]);
    return [[V[1]*det, -U[1]*det], [-V[0]*det, U[0]*det]];
}


function dot(ctx, x, y, f) {
    ctx.beginPath();
    ctx.arc(x, y, .025, 0, 2 * Math.PI);
    ctx.fillStyle = 'hsl(' + 360/20.*f + ', 100%, 50%)';
    ctx.fill();
}

function tri(ctx, x, y, up) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y + 1);
    if (up) {
        ctx.lineTo(x, y + 1);
    } else {
        ctx.lineTo(x + 1, y);
    }
    ctx.closePath();

    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 0.005;
    ctx.stroke();
}

function set_viewport(xmin, xmax, canvas) {
    var ctx = canvas.getContext('2d');

}
