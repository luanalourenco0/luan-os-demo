(function(root){
  'use strict';
  const W=root.LuanWorkspace||(typeof require==='function'&&require('../core/workspace.js'));
  function createService(panel){
    // No cache, database, source connector or alternate writer: derive from the shared service.
    return Object.freeze({accepts:W.accepts,view:(id='hoje',now=Date.now())=>W.view({id,state:panel.read(),loaded:panel.loaded,
      agenda:panel.snapshot('agenda'),updates:panel.snapshot('updates'),jobs:panel.snapshot('jobs'),
      failed:{agenda:panel.failed('agenda'),updates:panel.failed('updates'),jobs:panel.failed('jobs')}},now)});
  }
  root.LuanWorkspaceService=Object.freeze({createService});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanWorkspaceService;
})(globalThis);
