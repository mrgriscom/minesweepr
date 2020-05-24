EPSILON = 1e-6

function vec(x, y) {
    return {x: x, y: y};
}

function vecPolar(r, theta) {
    return vec(r * Math.cos(theta), r * Math.sin(theta));
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
    if (type == 'hex') {
        pentagon_caps(tx, faces);
    }
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

function pentagon_caps(tx, faces) {
    // determine how the pentagon links to the rest of the tiles by checking
    // the adjacent slot in all six directions; compute the number of adjacent tiles
    // and their average direction
    var link_to_adj = function(p) {
        var dirs_to_adj = [];
        for (var dir = 0; dir < 6; dir++) {
            var delta = [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]][dir];
            var p_adj = Vadd(p, vec(delta[0], delta[1]));
            var face = face_tri_to_num(to_face_tri(transform(p_adj, tx)));
            if (face != null) {
                // need to ensure all dirs are contiguous to compute average correctly
                // (i.e., 0 and 6 are and should average to -0.5 / 5.5)
                var normalized_dir = dir;
                if (dirs_to_adj.length > 0 && dir - 1 != dirs_to_adj.slice(-1)[0]) {
                    normalized_dir -= 6;
                }
                dirs_to_adj.push(normalized_dir);
            }
        }
        var sum = 0;
        for (var i = 0; i < dirs_to_adj.length; i++) {
            sum += dirs_to_adj[i];
        }
        return {avg_dir: mod(sum / dirs_to_adj.length, 6), count: dirs_to_adj.length};
    };

    var inv_tx = invert_transform(tx);
    for (var v = 0; v < 12; v++) {
        var footprint_vertex;
        if (v < 10) {
            footprint_vertex = vec(v % 5, 2 - Math.floor(v / 5));
        } else if (v == 10) {
            footprint_vertex = vec(1, 3);
        } else if (v == 11) {
            footprint_vertex = vec(5 - 1, 0);
        }
        var p = transform(footprint_vertex, inv_tx);
        
        var link = link_to_adj(p);
        if (footprint_vertex.x == 0) {
            // these can link to either side due to wraparound; determine which side
            // is more connected
            var p_alt = transform(vec(5, footprint_vertex.y), inv_tx);
            var alt_link = link_to_adj(p_alt);
            if (alt_link.count > link.count) {
                link = alt_link;
                p = p_alt;
            }
        }
        faces.push({face: -1, p: p, center: p, pentagon_anchor_dir: link.avg_dir});
    }

}

