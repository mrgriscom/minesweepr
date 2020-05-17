$(document).ready(function() {
    /*
    var N = 11;
    var i = 0;
    setInterval(function() {
        draw(N, i);
        i = (i+1)%N;
    }, 100);
    */
    
    draw(1, 0);
});

function draw(C, B) {
    var canvas = $('#canvas')[0];
    var ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(1, -1);
    ctx.translate(0, -canvas.height);
    ctx.scale(150, 150);

    ctx.transform(1, 0, -.5, .5*Math.sqrt(3), 0, 0); 
    
    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 5; x++) {
            tri(ctx, x, y, true);
            tri(ctx, x, y+1, false);
        }
    }

    var a = C-B;
    var b = B;
    itx(ctx, a, -b, b, a+b);
    
    for (var y = -50; y < 50; y++) {
        for (var x = -50; x < 50; x++) {
            dot(ctx, x, y);
        }
    }

}

function itx(ctx, a, b, c, d) {
    var inv = matrix_invert(a, b, c, d);
    ctx.transform(inv[0], inv[1], inv[2], inv[3], 0, 0);
}

function matrix_invert(a, b, c, d) {
    var det = 1./(a*d-b*c);
    return [d*det, -b*det, -c*det, a*det];
}

function dot(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, .05, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
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
