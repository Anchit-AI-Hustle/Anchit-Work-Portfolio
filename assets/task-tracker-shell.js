/* Promote the first-party /task-tracker shell to the canonical Task Tracker route. */
(function () {
  'use strict';

  function promoteRoute() {
    var skillMap = window.AnchitSkillMap;
    if (!skillMap || typeof skillMap.getMap !== 'function') return false;

    var map = skillMap.getMap();
    var taskTracker = null;
    (map.departments || []).some(function (department) {
      return (department.apps || []).some(function (app) {
        if (app.id !== 'task-tracker') return false;
        taskTracker = app;
        return true;
      });
    });

    if (!taskTracker) return false;
    taskTracker.path = '/task-tracker';
    taskTracker.aliases = ['/task-tracker.html'];
    taskTracker.external = false;
    taskTracker.prefix = false;

    // registerApp recalculates the runtime's current-route state. A deliberately
    // unknown department keeps this refresh node out of the rendered tree.
    if (typeof skillMap.registerApp === 'function') {
      skillMap.registerApp('__route_refresh__', {
        id: '__task-tracker-route-refresh',
        title: 'Task Tracker route refresh',
        path: '/__task-tracker-route-refresh'
      });
    }
    return true;
  }

  if (!promoteRoute()) {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (promoteRoute() || attempts >= 40) window.clearInterval(timer);
    }, 50);
  }
}());
