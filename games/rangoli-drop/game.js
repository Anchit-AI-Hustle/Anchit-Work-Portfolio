/*
 * Rangoli Drop, the 2D edition, for browsers without WebGL2. The rules,
 * controls, sound and HUD come from core.js and the drawing from view2d.js,
 * the same modules the 3D edition uses for its first frames.
 */
(function () {
  'use strict';
  Promise.all([import('/games/rangoli-drop/core.js'), import('/games/rangoli-drop/view2d.js')]).then(function (m) {
    m[0].boot(m[1].make2D());
  }).catch(function (e) { console.warn(e); });
})();
