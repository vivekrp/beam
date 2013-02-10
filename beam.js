(function(name, context, definition) {
    if(typeof module != 'undefined' && module.exports) module.exports = definition();
    else if(typeof define == 'function' && define.amd) define(definition);
    else context[name] = definition();
})('beam', this, function() {    
    var req = typeof require === 'function';
    var claw = req ? require('claw') : claw,
        Twain = req ? require('twain') : Twain,
        each = Twain.util.each,
        isValue = Twain.util.isValue;

    // requestAnimationFrame stuff.
    var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || fallback;

    var prev = new Date().getTime();

    function fallback(fn) {
        var curr = new Date().getTime();
        var ms = Math.max(0, 16 - (curr - prev));
        setTimeout(fn, ms);
        prev = curr;
    }

    var doc = document,
        // numUnit = /^(?:[\+\-]=)?\d+(?:\.\d+)?(%|in|cm|mm|em|ex|pt|pc|px)$/,
        unitless = {
            lineHeight: 1,
            zoom: 1,
            zIndex: 1,
            opacity: 1,
            transform: 1
        };

    function camelize(s) {
        return s.replace(/-(.)/g, function(m, m1) {
            return m1.toUpperCase();
        });
    }

    function uppercase(p, a) {
        return a.toUpperCase();
    }

    function vendor(property) {
        // return the vendor prefix for a given property. should even work with firefox fudging -webkit.
        var div = doc.createElement('div');
        var x = 'Khtml Moz Webkit O ms '.split(' '),
            i;
        for(i = x.length - 1; i >= 0; i--) {
            if(((x[i] ? x[i] + '-' : '') + property).replace(/\-(\w)/g, uppercase) in div.style) {
                return x[i] ? '-' + x[i].toLowerCase() + '-' : ''; // empty string, if it works without prefix
            }
        }
        return null; // not found...
    }

    function unit(style, def) {
        // extracts the unit part of the string. px, em, whatever. 
        return(/[a-z]+/.exec(style) || [def])[0]
    }

    function num(style) {
        // extracts the number part of the style
        return parseFloat(style, 10);
    }

    // initial style is determined by the elements themselves
    var getStyle = doc.defaultView && doc.defaultView.getComputedStyle ?
    function(el, property) {
        property = property == 'transform' ? transform : property
        var value = null,
            computed = doc.defaultView.getComputedStyle(el, '');
        computed && (value = computed[camelize(property)]);
        return el.style[property] || value;
    } : html.currentStyle ?

    function(el, property) {
        property = camelize(property);

        if(property == 'opacity') {
            var val = 100;
            try {
                val = el.filters['DXImageTransform.Microsoft.Alpha'].opacity;
            } catch(e1) {
                try {
                    val = el.filters('alpha').opacity;
                } catch(e2) {}
            }
            return val / 100;
        }
        var value = el.currentStyle ? el.currentStyle[property] : null
        return el.style[property] || value;
    } : function(el, property) {
        return el.style[camelize(property)];
    };

    function setStyle(el, prop, val) {
        // "special" setStyle
        // fyi: typeof val === 'number', or and rgb hash
        if(typeof prop !== 'string') {
            each(prop, function(v, p) {
                setStyle(el, p, v);
            });
            return;
        }

        prop = camelize(prop);
        // ok, so this the weird part 
        // because we're getting a number, we need to add unit to it 
        // we get that directly from the __beam__ stored on the element
        // fuck me, right?
        if(val.r) {
            el.style[prop] = rgb(val.r, val.g, val.b);
            return;
        }
        el.style[prop] = val + (unitless[prop] ? '' : el.__beam__.$t(prop).unit);
    }

    // convert rgb and short hex to long hex

    function toHex(c) {
        var m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        // short skirt to long jacket
        return(m ? rgb(m[1], m[2], m[3]) : c).replace(/#(\w)(\w)(\w)$/, '#$1$1$2$2$3$3');
    }

    function encodeColor(hex) {
        hex = toHex(hex);
        return {
            r: 16 * parseInt(hex.charAt(1), 16) + parseInt(hex.charAt(2), 16),
            g: 16 * parseInt(hex.charAt(3), 16) + parseInt(hex.charAt(4), 16),
            b: 16 * parseInt(hex.charAt(5), 16) + parseInt(hex.charAt(5), 16)
        };
    }

    var rgbOhex = /^rgb\(|#/;

    function rgb(r, g, b) {
        return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)
    }

    function encode(input) {
        var o = {};
        var t = this;
        each(input, function(val, prop) {
            prop = camelize(vendor(prop) || '' + prop);
            if(typeof val === 'string') {
                if(rgbOhex.test(val)) {
                    o[prop] = encodeColor(val);

                    return;
                }
                o[prop] = num(val);
                // we're assuming the tweens already exist
                return;
            }
            o[prop] = val;
        });
        return o;
    }


    var instances = [];

    function track(el) {
        // lemme know when proper object hashes become mainstream. 
        // until then, carry on young man
        if(el.__beam__) {
            return el.__beam__;
        }

        var twain = Twain({
            encode: encode
        }).update(function(step) {
            setStyle(el, step);
        });

        // run a separate one for transforms
        var transformer = twain.transformer = Twain().update(function(step) {
            // get back units
            var o = {};
            each(step, function(val, prop) {
                o[prop] = val + (unitless[prop] ? '' : transformer.$t(prop).unit);
            });
            claw(el, o);
        });
        instances.push(twain);

        el.__beam__ = twain;
        return twain;
    }

    function beam(el, to) {
        var tracker = track(el);
        var o = {};
        each(to, function(val, prop) {
            prop = camelize(vendor(prop) + prop);
            if(prop === claw.transform) {
                each(val, function(v, p) {

                    var tween = tracker.transformer.$t(p).to(num(v));
                    tween.unit = unit(v, '') || tween.unit || '';
                });
                return;
            }

            if(!tracker.tweens[prop]) {
                var currentStyle = getStyle(el, prop);
                if(rgbOhex.test(currentStyle)) {
                    var tween = tracker.$t(prop, true).from(encodeColor(currentStyle));
                } else {
                    var numerical = num(currentStyle);
                    // this inits the specific Tween
                    var tween = tracker.$t(prop).from(isValue(numerical) ? numerical : num(val));
                    tween.unit = unit(currentStyle, 'px');
                }
            }
            tracker.$t(prop).to(rgbOhex.test(val) ? encodeColor(val) : num(val));
        });

        // return a curried version of self. awesome-o. 
        return function(d) {
            return beam(el, d);
        };
    }

    beam.instances = instances;
    beam.encode = encode;

    // start off animation loop. 
    // todo - start/stop

    function animate() {
        raf(animate);
        // use a quick for loop
        for(var i = 0, j = instances.length; i < j; i++) {
            instances[i].update().transformer.update();
        }
    }

    animate();

    return beam;
});