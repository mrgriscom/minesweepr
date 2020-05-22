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



EPSILON = 1e-6

function vec(x, y) {
    return {x: x, y: y};
}

function Vadd(a, b) {
    return vec(a.x + b.x, a.y + b.y);
}

function transform(p, basis) {
    var U = basis.U;
    var V = basis.V;
    return vec(p.x * U.x + p.y * V.x,
               p.x * U.y + p.y * V.y);
}

function invert_transform(basis) {
    var U = basis.U;
    var V = basis.V;
    var det = 1. / (U.x * V.y - U.y * V.x);
    return {U: vec(V.y*det, -U.y*det),
            V: vec(-V.x*det, U.x*det)};
}

function skew_tx(N, c) {
    var b = N - c;
    return invert_transform({U: vec(b, -c), V: vec(c, b + c)});
}

function footprint_bounds(tx) {
    var bounds = {
        xmin: 0,
        xmax: 0,
        ymin: 0,
        ymax: 0,
    };

    var inv_tx = invert_transform(tx);
    $.each([0, 3], function(_, y) {
        $.each([0, 5], function(_, x) {
            var p = transform(vec(x, y), inv_tx);
            bounds.xmin = Math.min(bounds.xmin, p.x);
            bounds.xmax = Math.max(bounds.xmax, p.x);
            bounds.ymin = Math.min(bounds.ymin, p.y);
            bounds.ymax = Math.max(bounds.ymax, p.y);
        });
    });
    //console.log((bounds.xmax - bounds.xmin) * (bounds.ymax - bounds.ymin) / (3*N * 5*N));
    return bounds;
}

function tessellate(N, c, type) {
    var tx = skew_tx(N, c);
    var bounds = footprint_bounds(tx);
    
    var n = {hex: 1, tri: 2}[type];
    var faces = [];
    for (var y = bounds.ymin; y < bounds.ymax; y++) {
        for (var x = bounds.xmin; x < bounds.xmax; x++) {
            for (var i = 0 ; i < n; i++) {
                var face = face_for_tile(vec(x, y), i, type, tx);
                if (face != null) {
                    faces.push(face);
                }
            }
        }
    }
    // pentagons?
    return faces;
}

function to_face_tri(p) {
    var ix = Math.floor(p.x + EPSILON);
    var iy = Math.floor(p.y + EPSILON);
    var fx = p.x - ix;
    var fy = p.y - iy;

    // note: the inequalities here determine which face 'wins' the edges
    // there must be tie-breakers because an icosahedron's edges are not an even multiple of its faces
    var vertex = (fx < EPSILON && fy < EPSILON);
    var topheavy = fy > fx + EPSILON;
    return {x: ix, y: iy, topheavy: topheavy, vertex: vertex};
}

// map a face tri to a sequential face number; discard faces outside the icosahedron footprint
function face_tri_to_num(ft) {
    if (ft.x >= 0 && ft.x < 5) {
        if (ft.y == 2 && !ft.topheavy) {
            return ft.x;
        } else if (ft.y == 1) {
            return 5 + 2*ft.x + (ft.topheavy ? 0 : 1);
        } else if (ft.y == 0 && ft.topheavy) {
            return 15 + ft.x;
        }
    }
    return null;
}

function face_for_tile(p, i, type, sktx) {
    var topheavy = (type == 'tri' ? i == 1 : null);
    var center_offset = {
        hex: vec(0, 0),
        tri: {false: vec(2/3., 1/3.), true: vec(1/3., 2/3.)}[topheavy]
    }[type];
    var center = Vadd(p, center_offset);
    var face = to_face_tri(transform(center, sktx));

    var tile = {p: p, center: center};
    
    if (type == 'hex') {
        if (face.vertex) {
            // pentagon -- handled later
            return null;
        }
    } else if (type == 'tri') {
        tile.topheavy = topheavy;
        // face.vertex always false -- tri centers can't land on icosahedron vertices

        // triangle tiles can't be assigned to faces just based on their centers -- results in
        // an unpleasant sawtooth pattern. the reference point for determining the correct face
        // is the center of the conjoined 'diamond' with the neighboring triangle. but the
        // orientation of the diamond (hence, which neighbor) varies by which edge of the face
        // it's straddling. logic below sorts this all out.
        // note this logic depends on skew transform param c being normalized to range [0, N)
        
        var edge_conditions = {
            'vert': {
                relref: {false: vec(.5, 0), true: vec(.5, 1.)}[topheavy],
                dx: true,
            },
            'horiz': {
                relref: {false: vec(.5, .5), true: vec(.5, .5)}[topheavy],
                dy: true,
            },
            'sloped': {
                relref: {false: vec(1., .5), true: vec(0, .5)}[topheavy],
            },
        };
        $.each(edge_conditions, function(k, v) {
            // get adjacent face using the designated reference point
            var p_ref = Vadd(p, v.relref);
            var face_ref = to_face_tri(transform(p_ref, sktx));
            // check the adjacent face (if different from naive face), matches the expected
            // difference for the designated face edge
            if (face_ref.topheavy != face.topheavy &&
                !!v.dx == (face_ref.x != face.x) &&
                !!v.dy == (face_ref.y != face.y)) {
                face = face_ref;
                return false; // break
            }
        });
    }

    var face = face_tri_to_num(face);
    if (face == null) {
        return null;
    }
    tile.face = face;
    return tile;
}



function blah(N, c, type) {
    var canvas = $('#canvas')[0];
    var ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(1, -1);
    ctx.translate(0, -canvas.height);
    ctx.scale(200, 200);
    ctx.translate(1.1, .66);
    
    /*
    // draw footprint
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 5; x++) {
            tri(ctx, x, y, true);
            tri(ctx, x, y+1, false);
        }
    }
    */

    render(N, c, type, ctx);
    
}

function render(N, c, type, ctx) {
    var tritx = {U: vec(1, 0), V: vec(-.5, .5*Math.sqrt(3))};
    var sktx = skew_tx(N, c);
    var faces = tessellate(N, c, type);
    console.log(faces.length);
    
    var basis = transform(transform(vec(1, 0), sktx), tritx);
    var span = Math.sqrt(basis.x * basis.x + basis.y * basis.y);
    var theta0 = Math.atan2(basis.y, basis.x);

    var MARGIN = 1/200.; // tied to context scale factor
    var radius = (span - MARGIN) / Math.sqrt(3);
    
    $.each(faces, function(i, f) {
        var faceColor = '#ccc'; //'hsl(' + 77.2*f.face + ', 50%, ' + (f.face % 2 == 0 ? 30 : 40) + '%, 40%)';

        var nsides = {hex: 6, tri: 3}[type];
        var offset = {hex: .5, tri: (f.topheavy ? .5 : 0) - .25}[type];
        ctx.beginPath();
        for (var i = 0; i < nsides; i++) {
            var angle = 2*Math.PI / nsides * (i + offset) + theta0;
            var p = transform(transform(f.center, sktx), tritx);
            var q = Vadd(p, vec(radius * Math.cos(angle), radius * Math.sin(angle)));
            ctx.lineTo(q.x, q.y);
        }
        ctx.closePath();

        ctx.fillStyle = faceColor;
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 0.005;
        ctx.fill();
        //ctx.stroke();        
    });


}




/*
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
*/
