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

function blah(N, c) {
    var xmin = 0;
    var xmax = 0;
    var ymin = 0;
    var ymax = 0;

    var sktx = skew_tx(N, c);
    var isktx = invert_transform(sktx[0], sktx[1]);
    $.each([0, 3], function(_, y) {
        $.each([0, 5], function(_, x) {
            console.log(x, y);
            var p = transform([x, y], isktx[0], isktx[1]);
            console.log(p[0], p[1]);
            xmin = Math.min(xmin, p[0]);
            xmax = Math.max(xmax, p[0]);
            ymin = Math.min(ymin, p[1]);
            ymax = Math.max(ymax, p[1]);
        });
    });
    console.log(xmin, xmax, ymin, ymax);

    var canvas = $('#canvas')[0];
    var ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(1, -1);
    ctx.translate(0, -canvas.height);
    ctx.scale(150, 150);
    ctx.translate(1.1, .66);
    
    ctx.transform(1, 0, -.5, .5*Math.sqrt(3), 0, 0); 
    
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 5; x++) {
            tri(ctx, x, y, true);
            tri(ctx, x, y+1, false);
        }
    }

    var offsets = [[2/3.,1/3.],[1/3.,2/3.]];
    for (var y = ymin; y < ymax; y++) {
        for (var x = xmin; x < xmax; x++) {
            for (var i = 0 ; i < 2; i++) {
                var xy = transform([x+offsets[i][0], y+offsets[i][1]], sktx[0], sktx[1]);
                var f = assign_to_face(xy);
                if (f != null) {
                    dot(ctx, xy[0], xy[1], f);
                }
            }
        }
    }
    console.log((xmax - xmin + 1) * (ymax - ymin + 1) / (3*N+1) / (5*N+1));


    
}

function assign_to_face(xy) {
    // in tri mode, centers can't land on vertices
    // in hex mode, vertices should be ignored -- handled as a separate 'meta-face'?
    
    var x = xy[0];
    var y = xy[1];
    var ix = Math.floor(x + EPSILON);
    var iy = Math.floor(y + EPSILON);
    var fx = x - ix;
    var fy = y - iy;

    var vertex = (fx < EPSILON && fy < EPSILON);
    if (vertex) {
        return -1;
    }
    var top = fy > fx + EPSILON;

    if (ix >= 0 && ix < 5) {
        if (iy == 2 && !top) {
            return ix;
        } else if (iy == 1) {
            return 5 + 2*ix + (top ? 0 : 1);
        } else if (iy == 0 && top) {
            return 15 + ix;
        }
    }
    return null;
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
    
    ctx.lineWidth = 0.005;
    ctx.stroke();
}

function set_viewport(xmin, xmax, canvas) {
    var ctx = canvas.getContext('2d');

}
