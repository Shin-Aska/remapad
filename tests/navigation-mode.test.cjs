const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'shared/navigation-mode.js'), 'utf8');
function schema() { const context = vm.createContext({}); vm.runInContext(helper, context); return context.RemapadNavigationMode; }
const buttons = (...ids) => Array.from({ length: 16 }, (_, id) => ids.includes(id));

test('content constants load when window and the isolated script global are separate', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(helper, context);
  const constants = fs.readFileSync(path.join(root, 'content/modules/constants.js'), 'utf8');
  vm.runInContext(constants, context);
  assert.equal(context.window.RemapadCS.Constants.CONTROLLER_STYLE_PATTERNS, context.RemapadNavigationMode.CONTROLLER_STYLE_PATTERNS);
  assert.equal(context.window.RemapadCS.Constants.GLYPHS, context.RemapadNavigationMode.CONTROLLER_GLYPHS);
});

test('schema retains stable numeric ids and rejects duplicate or subset chords', () => {
  const n = schema();
  assert.equal(n.validateShortcuts({next:[1,1]}).valid, false);
  assert.equal(n.validateShortcuts({next:[1,2],previous:[1]}).valid, false);
  const set = n.normalizeProfileSet({ profiles:[{profileId:8,name:'Mine',bindings:{9:'toggle_hud'}}],nextProfileId:2 }, {6:'prev_tab'});
  assert.equal(set.profiles[0].profileId,8); assert.equal(set.nextProfileId,9);
});

test('defaults follow the standard buttons and the compact 8BitDo and N64 inputs', () => {
  const n = schema();
  const overrides = n.createProfileSet().profileShortcuts;
  const pads = [
    { id: 'DualSense Wireless Controller', mapping: 'standard' },
    { id: 'XInput Xbox', mapping: 'standard' },
    { id: 'Nintendo Switch Pro Controller', mapping: 'standard' },
    { id: 'Valve Steam Deck', mapping: 'standard' },
    { id: '1235-ab11 FC30', mapping: 'standard' }
  ];
  const expected = { next: [9, 15], previous: [9, 14], browse: [8, 9], closeTab: [0, 8] };
  for (const pad of pads) {
    assert.equal(JSON.stringify(n.resolveProfileShortcuts(overrides, n.shortcutLayout(pad))), JSON.stringify(expected));
  }

  const adapters = [
    { id: '1235-ab11 FC30', mapping: '', axes: [1, 0], start: 11, select: 10, face: 0, stick: 'left', axis: 0 },
    { id: '0079-0006 DragonRise', mapping: '', axes: [0, 0, 1, 0], start: 9, select: 8, face: 5, stick: 'right', axis: 2 },
    { id: 'Dragon Rise N64', mapping: '', axes: [0, 0, 0, 0, 0, 1], start: 9, select: 8, face: 5, stick: null, axis: 5 }
  ];
  for (const pad of adapters) {
    const layout = n.shortcutLayout(pad);
    const shortcuts = n.resolveProfileShortcuts(overrides, layout);
    assert.equal(shortcuts.browse.join(','), `${pad.select},${pad.start}`);
    assert.equal(shortcuts.closeTab.join(','), `${pad.face},${pad.select}`);
    for (const [axisValue, direction] of [[1, 'next'], [-1, 'previous']]) {
      pad.axes[pad.axis] = axisValue;
      pad.buttons = buttons(pad.start).map(pressed => ({ pressed }));
      const pressed = n.sampleShortcutButtons(pad, layout);
      const detector = n.createChordDetector();
      assert.equal(detector.sample(pressed, shortcuts, 0).actions.length, 0);
      assert.equal(n.bufferedDpadStick(pad, layout, pressed, detector), pad.stick);
      assert.equal(detector.sample(pressed, shortcuts, n.HOLD_MS).direction, direction);
    }
  }
});

test('legacy placeholders inherit defaults and explicit clears and recorded chords take precedence', () => {
  const n = schema();
  const legacy = n.createProfileSet();
  legacy.profileShortcuts = { next: [], previous: [] };
  const effective = n.resolveProfileShortcuts(n.normalizeProfileSet(legacy).profileShortcuts, 'xbox');
  assert.equal(effective.next.join(','), '9,15');
  assert.equal(effective.closeTab.join(','), '0,8');

  legacy.profileShortcuts = { next: [], previous: [], browse: [0, 8], closeTab: null };
  const override = n.resolveProfileShortcuts(n.normalizeProfileSet(legacy).profileShortcuts, 'xbox');
  assert.equal(override.next.length, 0);
  assert.equal(override.previous.length, 0);
  assert.equal(override.browse.join(','), '0,8');
  assert.equal(override.closeTab.length, 0);

  const clear = n.createProfileSet();
  clear.profileShortcuts.closeTab = [];
  assert.equal(n.resolveProfileShortcuts(n.normalizeProfileSet(clear).profileShortcuts, 'retro8bitdo').closeTab.length, 0);
  assert.equal(n.resolveProfileShortcuts(n.normalizeProfileSet(clear).profileShortcuts, 'n64').browse.join(','), '8,9');
});
test('shortcut buttons have a join buffer and other buttons dispatch on press', () => {
  const { ASSEMBLY_MS, createChordDetector } = schema();
  const detector = createChordDetector();
  const shortcuts = { next: [4, 5] };
  assert.equal(detector.sample(buttons(0, 4), shortcuts, 0).actions.join(','), '0');
  assert.equal(detector.sample(buttons(4), shortcuts, ASSEMBLY_MS - 1).actions.length, 0);
  assert.equal(detector.sample(buttons(4), shortcuts, ASSEMBLY_MS).actions.join(','), '4');
  const released = detector.sample(buttons(), shortcuts, ASSEMBLY_MS + 50);
  assert.equal(released.actions.length, 0);
  assert.equal(released.releases.join(','), '4');
});
test('profile switches fire once at the configured hold and early release suppresses singles', () => {
  const { createChordDetector, HOLD_MS } = schema();
  for (const direction of ['next', 'previous']) {
    const shortcuts = { [direction]: [4, 5] };
    const detector = createChordDetector();
    assert.equal(detector.sample(buttons(4), shortcuts, 0).actions.length, 0);
    assert.equal(detector.sample(buttons(4, 5), shortcuts, 100).actions.length, 0);
    assert.equal(detector.sample(buttons(4, 5), shortcuts, 100 + HOLD_MS - 1).direction, null);
    assert.equal(detector.sample(buttons(4, 5), shortcuts, 100 + HOLD_MS).direction, direction);
    assert.equal(detector.sample(buttons(4, 5), shortcuts, 110 + HOLD_MS * 2).direction, null);
    detector.reset();
    detector.sample(buttons(4, 5), shortcuts, 0);
    assert.equal(detector.sample(buttons(), shortcuts, 150).actions.length, 0);
  }
});

test('Close Browser Tab consumes its buttons and fires once per completed hold', () => {
  const { createChordDetector, validateShortcuts, HOLD_MS } = schema();
  const shortcuts = { closeTab: [8, 9] };
  assert.equal(validateShortcuts({ ...shortcuts, browse: [8, 9, 10] }).valid, false);
  const detector = createChordDetector();
  assert.equal(detector.sample(buttons(8, 9), shortcuts, 0).actions.length, 0);
  assert.equal(detector.sample(buttons(8, 9), shortcuts, HOLD_MS - 1).closeTab, false);
  const held = detector.sample(buttons(8, 9), shortcuts, HOLD_MS);
  assert.equal(held.closeTab, true);
  assert.equal(held.direction, null);
  assert.equal(held.openBrowse, false);
  assert.equal(held.actions.length, 0);
  assert.equal(detector.sample(buttons(8, 9), shortcuts, 2 * HOLD_MS).closeTab, false);
  detector.sample(buttons(), shortcuts, 2 * HOLD_MS + 10);
  detector.sample(buttons(8, 9), shortcuts, 3 * HOLD_MS);
  const released = detector.sample(buttons(8), shortcuts, 4 * HOLD_MS - 1);
  assert.equal(released.closeTab, false);
  assert.equal(released.actions.length, 0);
});
test('focus/controller reset requires neutral before input resumes', () => {
  const d=schema().createChordDetector(), s={next:[4,5]};
  d.sample(buttons(4,5),s,0);d.reset(true);
  assert.equal(d.sample(buttons(4,5),s,6000).direction,null);
  d.sample(buttons(),s,6010);
  assert.equal(d.sample(buttons(0),s,6020).actions.join(','),'0');
});

test('Browse opens once on a full hold and consumes the chord buttons', () => {
  const n = schema();
  const detector = n.createChordDetector();
  const shortcuts = { browse: [8, 9], next: [4, 5], previous: [6, 7] };
  assert.equal(detector.sample(buttons(8, 9), shortcuts, 0).actions.length, 0);
  assert.equal(detector.sample(buttons(8, 9), shortcuts, n.HOLD_MS - 1).openBrowse, false);
  const held = detector.sample(buttons(8, 9), shortcuts, n.HOLD_MS);
  assert.equal(held.openBrowse, true);
  assert.equal(held.direction, null);
  assert.equal(held.actions.length, 0);
  assert.equal(detector.sample(buttons(8, 9), shortcuts, 12000).openBrowse, false);
  detector.sample(buttons(), shortcuts, 12010);
  detector.sample(buttons(8, 9), shortcuts, 12020);
  assert.equal(detector.sample(buttons(8), shortcuts, 12100).openBrowse, false);
  assert.equal(detector.sample(buttons(8, 9), shortcuts, 17500).openBrowse, false);
});

test('Browse rejects equal or nested shortcuts and cancels ambiguous holds', () => {
  const n = schema();
  assert.equal(n.validateShortcuts({ next: [4, 5], browse: [5, 4] }).valid, false);
  assert.equal(n.validateShortcuts({ previous: [4, 5, 6], browse: [4, 6] }).valid, false);
  const detector = n.createChordDetector();
  const shortcuts = { next: [4, 5], browse: [5, 6] };
  assert.equal(n.validateShortcuts(shortcuts).valid, true);
  detector.sample(buttons(4, 5, 6), shortcuts, 0);
  const held = detector.sample(buttons(5, 6), shortcuts, n.HOLD_MS);
  assert.equal(held.openBrowse, false);
  assert.equal(held.direction, null);
});

async function background(options = {}) {
  const data={websiteMappings:{'example.com':{9:'search'}},defaultMapping:{9:'toggle_hud'},navigationModeEnabled:false,...(options.data || {})};
  const grants=new Set(['*://*/*','*://example.com/*']); const removed=[],listeners=[], notifications=[];
  const event={addListener(){}};
  const permissionEvents = { added: null, removed: null, connect: null };
  const api={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:fn=>listeners.push(fn)},onConnect:{addListener:fn=>permissionEvents.connect=fn},onStartup:event,onInstalled:event},storage:{local:{get:async keys=>keys===null?{...data}:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]])),set:async value=>Object.assign(data,value)},onChanged:event},permissions:{getAll:async()=>({origins:[...grants]}),contains:async q=>q.origins?q.origins.every(p=>grants.has(p)):false,remove:async q=>{if(options.removeFails)return false;removed.push(...q.origins);q.origins.forEach(p=>grants.delete(p));if(options.chromeSubsetRemoval && q.origins.includes('*://*/*'))grants.delete('*://example.com/*');return true;},onAdded:{addListener:fn=>permissionEvents.added=fn},onRemoved:{addListener:fn=>permissionEvents.removed=fn}},scripting:{getRegisteredContentScripts:async()=>[],registerContentScripts:async()=>{},unregisterContentScripts:async()=>{}},tabs:{get:async id=>({id,url:options.ownerTabLive && id === 20?'chrome-extension://extension/options/options.html':options.sourceUrl || 'https://example.com/',active:true,windowId:1}),query:async()=>options.redactedTabs?[{id:7}]:[],sendMessage:async(id,message)=>notifications.push({id,message}),onRemoved:event}};
  const popupWindows = [];
  const closedTabs = [];
  const activatedTabs = [];
  const createdTabs = [];
  if (options.tabs) {
    api.tabs.get = async id => {
      const tab = options.tabs.find(tab => tab.id === id);
      if (!tab) throw new Error('Tab closed.');
      return { ...tab };
    };
    api.tabs.query = async query => options.tabs.filter(tab => query.windowId === undefined || tab.windowId === query.windowId);
    api.tabs.update = async (id, properties) => activatedTabs.push({ id, ...properties });
    api.tabs.remove = async id => closedTabs.push(id);
    api.tabs.create = async properties => {
      createdTabs.push(properties);
      return { id: 100 };
    };
  }
  api.windows = {
    get: async () => ({ focused: options.windowFocused !== false }),
    create: async request => {
      if (options.failPopup) throw new Error('Popup could not be opened.');
      popupWindows.push(request);
    }
  };
  const context=vm.createContext({chrome:api,console,URL,fetch});vm.runInContext(helper,context);vm.runInContext(fs.readFileSync(path.join(root,'background/service_worker.js'),'utf8'),context);
  await vm.runInContext('contentScriptSyncQueue',context);
  const request=(message,senderOverride)=>new Promise((resolve,reject)=>{ let handled=false;for(const fn of listeners) if(fn(message,senderOverride || {id:'extension',url:api.runtime.getURL('options/options.html')},resolve)) handled=true;if(!handled)reject(Error('No handler')); });
  const flush = async () => { await Promise.resolve(); await vm.runInContext('navigationWriteQueue', context); await vm.runInContext('contentScriptSyncQueue', context); };
  const connect = token => {
    let disconnect, receive;
    permissionEvents.connect({ name: 'remapad-navigation-permission-draft:' + token, sender: { id:'extension',url:api.runtime.getURL('options/options.html'), ...(options.ownerTabLive ? {tab:{id:20}} : {}) }, onMessage:{addListener:fn=>receive=fn},postMessage(){},onDisconnect: { addListener: fn => disconnect = fn } });
    const close = () => disconnect();
    close.start = () => receive({type:'REQUEST_STARTED',token});
    return close;
  };
  return {data,grants,removed,request,notifications,permissionEvents,flush,connect,popupWindows,closedTabs,activatedTabs,createdTabs};
}
test('enable seeds independently and off removes only newly acquired broad grant',async()=>{
  const b=await background();const standard=JSON.stringify(b.data.websiteMappings);
  assert.equal((await b.request({type:'SET_NAVIGATION_MODE',enabled:true,acquiredBroad:true})).success,true);
  assert.equal(b.data.navigationModeWebsiteMappings['example.com'].profiles[0].bindings[9],'search');
  assert.equal(b.data.navigationModeDefaultMapping[6],'prev_tab');
  await b.request({type:'SET_NAVIGATION_MODE',enabled:false});
  assert.equal(b.removed.join(','),'*://*/*'); assert.equal(b.grants.has('*://example.com/*'),true);
  assert.equal(JSON.stringify(b.data.websiteMappings),standard);
});
test('pre-existing wildcard survives mode off and missing wildcard prevents enable',async()=>{
  const b=await background();await b.request({type:'SET_NAVIGATION_MODE',enabled:true});await b.request({type:'SET_NAVIGATION_MODE',enabled:false});
  assert.equal(b.removed.length,0);b.grants.delete('*://*/*');
  assert.equal((await b.request({type:'SET_NAVIGATION_MODE',enabled:true})).success,false);
});

test('an older saved profile accepts new Browse and Close Browser Tab shortcuts', async () => {
  const b = await background();
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true });
  const stored = b.data.navigationModeWebsiteMappings['example.com'];
  stored.profileShortcuts = { next: [4, 5], previous: [] };
  const normalized = schema().normalizeProfileSet(stored, b.data.navigationModeDefaultMapping);
  assert.equal(normalized.profileShortcuts.browse, null);
  assert.equal(normalized.profileShortcuts.closeTab, null);
  const value = { ...normalized, profileShortcuts: { ...normalized.profileShortcuts, browse: [8, 9], closeTab: [10, 11] } };
  const result = await b.request({ type: 'SAVE_NAVIGATION_MODE_MAPPINGS', websiteChanges: { 'example.com': { expected: stored, value } } });
  assert.equal(result.success, true);
  assert.equal(b.data.navigationModeWebsiteMappings['example.com'].profileShortcuts.browse.join(','), '8,9');
  assert.equal(b.data.navigationModeWebsiteMappings['example.com'].profileShortcuts.closeTab.join(','), '10,11');
  assert.equal(b.data.navigationModeWebsiteMappings['example.com'].profileShortcuts.next.join(','), '4,5');
});

test('only one Settings page claims migration for existing Next Browser Tab mappings', async () => {
  const b = await background({ data: {
    defaultMapping: undefined,
    profiles: { default: { 7: 'next_tab' }, oldSite: { 3: 'next_tab' } },
    websiteMappings: {
      'example.com': 'oldSite',
      'previous.example': { 6: 'prev_tab' },
      '__remapad_options__': { 7: 'next_tab' }
    }
  } });
  const request = { type: 'CLAIM_NEXT_TAB_MIGRATION' };
  const [first, second] = await Promise.all([b.request(request), b.request(request)]);
  assert.equal(first.offer.includesDefaults, true);
  assert.equal(first.offer.hostnames.join(','), 'example.com');
  assert.equal(second.offer, null);
  assert.equal(b.data.navigationModeEnabled, false);
  assert.equal(b.data.websiteMappings['example.com'], 'oldSite');
});

test('migration ignores Previous Browser Tab, Settings sections, and freshly created Next Browser Tab bindings', async () => {
  const b = await background({ data: {
    defaultMapping: { 6: 'prev_tab' },
    websiteMappings: { '__remapad_options__': { 7: 'next_tab' }, 'example.com': { 6: 'prev_tab' } }
  } });
  const request = { type: 'CLAIM_NEXT_TAB_MIGRATION' };
  assert.equal((await b.request(request)).offer, null);
  b.data.websiteMappings['example.com'][7] = 'next_tab';
  assert.equal((await b.request(request)).offer, null);
});

test('migration checks current eligibility again before showing the one-time popup', async () => {
  const b = await background({ data: { websiteMappings: { 'example.com': { 7: 'next_tab' } } } });
  await b.flush();
  delete b.data.websiteMappings['example.com'][7];
  assert.equal((await b.request({ type: 'CLAIM_NEXT_TAB_MIGRATION' })).offer, null);
});

test('a different active site gets the one-time offer and all saved mappings migrate', async () => {
  const sourceUrl = 'https://primevideo.com/watch';
  const websiteMappings = {
    'netflix.com': { 8: 'next_tab' },
    'primevideo.com': { 3: 'fullscreen' },
    'example.com': { 9: 'toggle_play' }
  };
  const b = await background({ sourceUrl, data: { websiteMappings, defaultMapping: { 4: 'back' } } });
  b.grants.add('https://primevideo.com/*');
  const sender = { id: 'extension', frameId: 0, url: sourceUrl, tab: { id: 4, url: sourceUrl } };
  const onSite = { type: 'OFFER_NEXT_TAB_MIGRATION_ON_SITE' };
  await Promise.all([b.request(onSite, sender), b.request(onSite, sender)]);
  assert.equal(b.popupWindows.length, 1);
  const [popup] = b.popupWindows;
  assert.equal(popup.type, 'popup');
  const claim = { type: 'CLAIM_NEXT_TAB_MIGRATION' };
  assert.equal((await b.request(claim)).offer, null);
  const claimed = await b.request(claim, { id: 'extension', url: popup.url });
  assert.equal(claimed.offer.hostnames.join(','), 'netflix.com');
  assert.equal((await b.request(claim, { id: 'extension', url: popup.url })).offer, null);
  assert.equal(b.data.navigationModeEnabled, false);
  assert.equal((await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true })).success, true);
  assert.equal(Object.keys(b.data.navigationModeWebsiteMappings).sort().join(','), 'example.com,netflix.com,primevideo.com');
  assert.equal(b.data.navigationModeWebsiteMappings['primevideo.com'].profiles[0].bindings[3], 'fullscreen');
  assert.equal(b.data.navigationModeDefaultMapping[4], 'back');
  assert.equal(b.data.websiteMappings, websiteMappings);
});

test('a background website or failed window leaves the migration available in Settings', async () => {
  const sourceUrl = 'https://primevideo.com/watch';
  const websiteMappings = { 'netflix.com': { 7: 'next_tab' }, 'primevideo.com': { 3: 'fullscreen' } };
  const sender = { id: 'extension', frameId: 0, url: sourceUrl, tab: { id: 4, url: sourceUrl } };
  for (const options of [{ windowFocused: false }, { failPopup: true }]) {
    const b = await background({ sourceUrl, data: { websiteMappings }, ...options });
    b.grants.add('https://primevideo.com/*');
    await b.request({ type: 'OFFER_NEXT_TAB_MIGRATION_ON_SITE' }, sender);
    assert.equal(b.popupWindows.length, 0);
    assert.equal((await b.request({ type: 'CLAIM_NEXT_TAB_MIGRATION' })).offer.hostnames.join(','), 'netflix.com');
  }
});

test('Chrome subset removal retains exact restoration backup before release', async () => {
  const b = await background({ chromeSubsetRemoval: true });
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true, acquiredBroad: true });
  const result = await b.request({ type: 'SET_NAVIGATION_MODE', enabled: false });
  assert.equal(result.enabled, false);
  assert.equal(result.restoreOrigins.join(','), '*://example.com/*');
  assert.equal(b.data.navigationModeRestoreOrigins.join(','), '*://example.com/*');
  b.grants.add('*://example.com/*');
  assert.equal((await b.request({ type: 'NAVIGATION_MODE_STATUS' })).restoreOrigins.length, 0);
  b.grants.delete('*://example.com/*');
  assert.equal((await b.request({ type: 'NAVIGATION_MODE_STATUS' })).restoreOrigins.length, 0);
});
test('Firefox exact removal retains narrow origins without restoration request', async () => {
  const b = await background();
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true, acquiredBroad: true });
  const result = await b.request({ type: 'SET_NAVIGATION_MODE', enabled: false });
  assert.equal(result.restoreOrigins.length, 0);
  assert.equal(b.grants.has('*://example.com/*'), true);
});
test('failed broad removal preserves ownership for retry and leaves mode off', async () => {
  const b = await background({ removeFails: true });
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true, acquiredBroad: true });
  assert.equal((await b.request({ type: 'SET_NAVIGATION_MODE', enabled: false })).success, false);
  assert.equal(b.data.navigationModeEnabled, false);
  assert.equal(b.data.navigationModeOwnsBroadAccess, true);
});
test('draft cancellation releases only while mode disabled, preserving backup', async () => {
  const b = await background({ chromeSubsetRemoval: true });
  const cancelled = await b.request({ type: 'SET_NAVIGATION_MODE', enabled: false, releaseDraft: true });
  assert.equal(cancelled.restoreOrigins.join(','), '*://example.com/*');
  const active = await background();
  await active.request({ type: 'SET_NAVIGATION_MODE', enabled: true });
  assert.equal((await active.request({ type: 'SET_NAVIGATION_MODE', enabled: false, releaseDraft: true })).success, false);
  assert.equal(active.data.navigationModeEnabled, true);
});
test('redacted tab URLs still receive explicit deactivation', async () => {
  const b = await background({ redactedTabs: true });
  await b.request({ type: 'NAVIGATION_MODE_RECONCILE' });
  assert.equal(b.notifications.some(item => item.id === 7 && item.message.active === false), true);
});
test('nonempty single-button shortcuts are rejected', () => {
  assert.equal(schema().validateShortcuts({ next: [4] }).valid, false);
});
test('simultaneous complete candidates cancel until all buttons release', () => {
  const { createChordDetector, HOLD_MS } = schema();
  const d = createChordDetector();
  const shortcuts = { next: [4, 5], previous: [6, 7] };
  assert.equal(d.sample(buttons(4,5,6,7), shortcuts, 0).actions.length, 0);
  assert.equal(d.sample(buttons(4,5), shortcuts, 6000).direction, null);
  d.sample(buttons(), shortcuts, 6010);
  d.sample(buttons(4,5), shortcuts, 6020);
  assert.equal(d.sample(buttons(4,5), shortcuts, 6020 + HOLD_MS).direction, 'next');
});
test('partial release/repress after firing or cancellation never resumes a chord', () => {
  const { createChordDetector, HOLD_MS } = schema();
  const d = createChordDetector(), shortcuts = { next: [4, 5] };
  d.sample(buttons(4,5), shortcuts, 0);
  assert.equal(d.sample(buttons(4,5), shortcuts, HOLD_MS).direction, 'next');
  d.sample(buttons(4), shortcuts, HOLD_MS + 10);
  d.sample(buttons(4,5), shortcuts, HOLD_MS + 20);
  assert.equal(d.sample(buttons(4,5), shortcuts, 2 * HOLD_MS + 20).direction, null);
  d.reset(); d.sample(buttons(4,5), shortcuts, 0);
  d.sample(buttons(4), shortcuts, 100);
  d.sample(buttons(4,5), shortcuts, 150);
  assert.equal(d.sample(buttons(4,5), shortcuts, 150 + HOLD_MS).direction, null);
});

test('content input gate blocks actions and stick continuation while swap or neutral is pending', () => {
  const source = fs.readFileSync(path.join(root, 'content/content_script.js'), 'utf8');
  const start = source.indexOf('    if (settings.navigationMode) {\n      // Gate before sampling');
  const end = source.indexOf('    // Tutorial is modal:', start);
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({
    settings: { navigationMode: true, navSettings: { enabled: true, leftStick: { enabled: true, mode: 'cursor' } } }, RemapadNavigationMode: schema(), activeControllerStyle: null, modeNeutral: true, modeSwitchPending: true,
    gp: { axes: [0, 0], buttons: buttons(0).map(pressed => ({ pressed })) }, DEADZONE: 0.2,
    performance: { now: () => 1000 }, pressed: 0, sampled: 0, continued: false,
    chordDetector: { sample() { context.sampled++; return { actions: [0], releases: [] }; }, reset() {} },
    onButtonPress() { context.pressed++; }, onButtonRelease() {},
  });
  vm.runInContext('function pollInput() {' + source.slice(start, end) + 'continued = true;}', context);
  vm.runInContext('pollInput()', context);
  assert.equal(context.pressed, 0); assert.equal(context.sampled, 0); assert.equal(context.continued, false);
  context.modeSwitchPending = false;
  vm.runInContext('pollInput()', context);
  assert.equal(context.pressed, 0); assert.equal(context.modeNeutral, true);
  context.gp.buttons = buttons().map(pressed => ({ pressed })); context.gp.axes = [0.8, 0];
  vm.runInContext('pollInput()', context);
  assert.equal(context.modeNeutral, true);
  context.gp.axes = [0, 0]; vm.runInContext('pollInput()', context);
  assert.equal(context.modeNeutral, false); assert.equal(context.pressed, 0);
  // Standard bypasses both gates and never invokes the chord detector.
  context.settings.navigationMode = false; context.modeNeutral = true; context.modeSwitchPending = true;
  vm.runInContext('pollInput()', context);
  assert.equal(context.continued, true); assert.equal(context.sampled, 0);
});

test('neutral gate ignores unused, HAT, and sentinel axes but waits for configured sticks', () => {
  const n = schema();
  const nav = { enabled: true, leftStick: { enabled: true, mode: 'cursor' }, rightStick: { enabled: false, mode: 'scroll' } };
  const gp = { mapping: '', axes: [0, 0, -1, 1, -1, 1] };
  assert.equal(n.areInputsNeutral(buttons(), gp, nav, 'n64'), true);
  assert.equal(n.areInputsNeutral(buttons(12), gp, nav, 'n64'), false);
  gp.axes[0] = 0.8;
  assert.equal(n.areInputsNeutral(buttons(), gp, nav, 'n64'), false);
  gp.axes[0] = 3.2857;
  assert.equal(n.areInputsNeutral(buttons(), gp, nav, 'n64'), true);
  nav.rightStick.enabled = true;
  gp.axes = [0, 0, -1, 1];
  assert.equal(n.areInputsNeutral(buttons(), gp, nav, 'n64'), true);
  gp.mapping = 'standard';
  assert.equal(n.areInputsNeutral(buttons(), gp, nav, 'n64'), false);
});
test('controller identity includes id when a replacement reuses an index, and disconnect clears state', () => {
  const source = fs.readFileSync(path.join(root, 'content/content_script.js'), 'utf8');
  const start = source.indexOf('  function selectActiveGamepad(gamepads) {');
  const end = source.indexOf('  function pollGamepads()', start);
  const context = vm.createContext({
    activeGamepadIndex: 0, activeGamepadId: 'old', settings: { navigationMode: true },
    gamepadSnapshots: new Map(), prevButtonStates: [true], resetCount: 0,
    getGamepadInputActivity: () => 0, chordDetector: { reset() {} },
    resetModeInput() { context.resetCount++; context.prevButtonStates = []; },
  });
  vm.runInContext(source.slice(start, end), context);
  context.pad = { index: 0, id: 'new', connected: true };
  vm.runInContext('selectActiveGamepad([pad])', context);
  assert.equal(context.resetCount, 1);
  assert.equal(context.activeGamepadId, 'new');
  vm.runInContext('selectActiveGamepad([])', context);
  assert.equal(context.resetCount, 2);
  assert.equal(context.activeGamepadId, null);
});

test('external wildcard loss clears persisted intent and ownership before direct regrant', async () => {
  const b = await background();
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true, acquiredBroad: true });
  b.grants.delete('*://*/*');
  b.permissionEvents.removed({ origins: [] });
  // A direct later grant must not resurrect the earlier mode intent.
  b.grants.add('*://*/*');
  b.permissionEvents.added({ origins: [] });
  await b.flush();
  assert.equal(b.data.navigationModeEnabled, false);
  assert.equal(b.data.navigationModeOwnsBroadAccess, false);
  assert.equal((await b.request({ type: 'NAVIGATION_MODE_STATUS' })).enabled, false);
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true, acquiredBroad: true });
  assert.equal(b.data.navigationModeOwnsBroadAccess, true);
});
test('Quick Map preserves an effective adapter template and rejects concurrent mapping changes', async () => {
  const b = await background();
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true });
  const sender = { id:'extension',frameId:0,url:'https://example.com/',tab:{id:7,url:'https://example.com/'} };
  const current = await b.request({ type:'GET_NAVIGATION_PROFILE' }, sender);
  const template = { ...current.profile.bindings, 0:'scroll_up', 4:'back', 5:'click' };
  const message = { type:'SAVE_NAVIGATION_BUTTON', button:3, actionValue:'click_element:#next', profileId:current.profileId,expectedBindings:current.profile.bindings,profileTemplate:template };
  const result = await b.request(message, sender);
  assert.equal(result.success, true);
  assert.equal(result.bindings[0], 'scroll_up'); assert.equal(result.bindings[4], 'back'); assert.equal(result.bindings[5], 'click');
  assert.equal((await b.request(message, sender)).success, false);
});
test('SettingsStore applies the authoritative broker profile and profile set after a storage race', async () => {
  const n = schema();
  const oldSet = n.createProfileSet({0:'old'}), currentSet = n.createProfileSet({0:'new'});
  currentSet.profiles[0].name = 'Latest';
  const context = vm.createContext({ structuredClone, RemapadNavigationMode:n });
  vm.runInContext(fs.readFileSync(path.join(root,'content/modules/settings-store.js'),'utf8'),context);
  const store = context.RemapadCS.SettingsStore.create({ hostname:'example.com',constants:{ DEFAULT_PROFILE:{0:'click'}, DEFAULT_NAV_SETTINGS:{},WEBSITE_MAPPINGS_DEFAULT:{},SITE_COLLECTIONS_DEFAULT:{} },api:{ storage:{local:{get:async()=>({navigationModeWebsiteMappings:{'example.com':oldSet}})}},runtime:{sendMessage:async message=>message.type==='GET_NAVIGATION_STATUS'?{active:true,navigationMode:true}:{success:true,profileId:1,profile:currentSet.profiles[0],profileSet:currentSet}} } });
  await store.load();
  assert.equal(store.getActiveProfile()[0], 'new');
  assert.equal(store.getSettings().navigationProfileSet.profiles[0].name, 'Latest');
});
test('permission draft disconnect keeps tombstone until a late grant is safely released', async () => {
  const b = await background({ chromeSubsetRemoval:true });
  b.grants.delete('*://*/*');
  const token = 'document-token-123';
  const disconnect = b.connect(token);
  assert.equal((await b.request({ type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token })).success,true);
  disconnect.start(); await b.flush();
  disconnect(); await b.flush();
  assert.equal(b.data.navigationModePermissionDraft.cancelled,true);
  b.grants.add('*://*/*'); b.permissionEvents.added({origins:[]}); await b.flush();
  assert.equal(b.grants.has('*://*/*'),false);
  assert.equal(b.data.navigationModePermissionDraft,null);
  assert.equal((await b.request({type:'NAVIGATION_MODE_STATUS'})).restoreOrigins.join(','),'*://example.com/*');
});
test('permission draft never removes pre-existing or successfully committed wildcard', async () => {
  const existing = await background();
  const token = 'document-existing-123'; const disconnect = existing.connect(token);
  await existing.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token});
  disconnect(); await existing.flush(); assert.equal(existing.grants.has('*://*/*'),true);
  const b = await background(); b.grants.delete('*://*/*');
  const close = b.connect(token); await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token});
  close.start(); await b.flush();
  b.grants.add('*://*/*'); b.permissionEvents.added({}); await b.flush();
  await b.request({type:'FINISH_NAVIGATION_MODE_PERMISSION_DRAFT',token});
  await b.request({type:'SET_NAVIGATION_MODE',enabled:true,draftToken:token});
  close(); await b.flush();
  assert.equal(b.grants.has('*://*/*'),true); assert.equal(b.data.navigationModeOwnsBroadAccess,true);
});

test('idle permission preparation never persists a blocking tombstone across reload or two Options windows', async () => {
  const b = await background(); b.grants.delete('*://*/*');
  const closeFirst = b.connect('idle-window-first');
  assert.equal((await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'idle-window-first'})).success,true);
  const closeSecond = b.connect('idle-window-second');
  assert.equal((await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'idle-window-second'})).success,false);
  assert.equal(b.data.navigationModePermissionDraft,undefined);
  closeFirst(); await b.flush();
  assert.equal((await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'idle-window-second'})).success,true);
  closeSecond(); await b.flush();
  const reload = b.connect('idle-window-reloaded');
  assert.equal((await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'idle-window-reloaded'})).success,true);
  assert.equal(b.data.navigationModePermissionDraft,undefined);
  reload(); await b.flush();
});
test('lost worker port does not cancel a started request whose Options owner is still live', async () => {
  const b = await background({ownerTabLive:true}); b.grants.delete('*://*/*');
  const token = 'worker-restart-owner'; const close = b.connect(token);
  await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token});
  close.start(); await b.flush();
  assert.equal(b.data.navigationModePermissionDraft.ownerTabId,20);
  close(); await b.flush();
  assert.equal(b.data.navigationModePermissionDraft.cancelled,false);
  b.grants.add('*://*/*'); b.permissionEvents.added({}); await b.flush();
  assert.equal(b.grants.has('*://*/*'),true);
  await b.request({type:'CANCEL_NAVIGATION_MODE_PERMISSION_DRAFT',token});
  assert.equal(b.grants.has('*://*/*'),false);
});
test('old idle persisted drafts are migrated away without claiming later grants', async () => {
  const b = await background({data:{navigationModePermissionDraft:{token:'old-idle-token',hadBroad:false,cancelled:true,settled:false}}});
  await b.flush();
  assert.equal(b.data.navigationModePermissionDraft,null);
  assert.equal(b.grants.has('*://*/*'),true);
});

test('explicit retry after close supersedes a cancelled no-broad predecessor', async () => {
  const b = await background(); b.grants.delete('*://*/*');
  const first = b.connect('closed-request-first');
  await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'closed-request-first'});
  first.start(); await b.flush(); first(); await b.flush();
  assert.equal(b.data.navigationModePermissionDraft.cancelled,true);
  const retry = b.connect('closed-request-retry');
  const ready = await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'closed-request-retry'});
  assert.equal(ready.success,true); assert.ok(ready.expiresAt > Date.now());
  retry.start(); await b.flush();
  assert.equal(b.data.navigationModePermissionDraft.token,'closed-request-retry');
  assert.equal(b.data.navigationModePermissionDraft.cancelled,false);
  b.grants.add('*://*/*'); b.permissionEvents.added({}); await b.flush();
  assert.equal(b.grants.has('*://*/*'),true);
  await b.request({type:'FINISH_NAVIGATION_MODE_PERMISSION_DRAFT',token:'closed-request-retry'});
  assert.equal((await b.request({type:'SET_NAVIGATION_MODE',enabled:true,draftToken:'closed-request-retry'})).success,true);
});
test('live started request rejects a second preparation before a native prompt can launch', async () => {
  const b = await background(); b.grants.delete('*://*/*');
  const first = b.connect('live-request-first');
  await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'live-request-first'});
  first.start(); await b.flush();
  b.connect('live-request-second');
  const result = await b.request({type:'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT',token:'live-request-second'});
  assert.equal(result.success,false);
  assert.match(result.error,/other Options window/);
  assert.equal(b.data.navigationModePermissionDraft.token,'live-request-first');
});

test('ordinary profile actions are Navigation-only and share the chord switch path', () => {
  const source = fs.readFileSync(path.join(root, 'content/content_script.js'), 'utf8');
  const start = source.indexOf('  function executeAction(action) {');
  const end = source.indexOf("    console.log('[Remapad CS] Executing action:', action);", start);
  const context = vm.createContext({ settings:{navigationMode:false}, modeNeutral:false, modeSwitchPending:false, isSiteActive:()=>true, switched:[], switchNavigationProfile(direction){context.switched.push(direction);} });
  vm.runInContext(source.slice(start,end)+'}',context);
  vm.runInContext("executeAction('next_profile')",context);
  assert.equal(context.switched.length,0);
  context.settings.navigationMode = true;
  vm.runInContext("executeAction('next_profile');executeAction('prev_profile')",context);
  assert.equal(context.switched.join(','),'next,previous');
  context.modeSwitchPending = true;
  vm.runInContext("executeAction('next_profile')",context);
  assert.equal(context.switched.length,2);
  assert.ok(source.includes('switchNavigationProfile(result.direction)'));
});

test('mapping conflicts ignore object key order while preserving ordered profile semantics', async () => {
  const b = await background();
  await b.request({type:'SET_NAVIGATION_MODE',enabled:true});
  const set = b.data.navigationModeWebsiteMappings['example.com'];
  const profile = set.profiles[0];
  // Chrome may serialize object keys in a different order than the editor's
  // normalizer, including keys nested inside profiles and shortcut objects.
  b.data.navigationModeWebsiteMappings['example.com'] = {
    nextProfileId:set.nextProfileId,
    profileShortcuts:{previous:[],next:[]},
    profiles:[{bindings:{...profile.bindings},name:profile.name,profileId:profile.profileId}]
  };
  const second = {profileId:2,name:'Second',bindings:{...profile.bindings}};
  const value = {profiles:[profile,second],profileShortcuts:{next:[4,5],previous:[]},nextProfileId:3};
  const expected = { ...set, profileShortcuts: { next: [], previous: [] } };
  const result = await b.request({type:'SAVE_NAVIGATION_MODE_MAPPINGS',websiteChanges:{'example.com':{expected,value}}});
  assert.equal(result.success,true);
  assert.equal(b.data.navigationModeWebsiteMappings['example.com'].profiles.length,2);
  const stored = b.data.navigationModeWebsiteMappings['example.com'];
  const reordered = {...stored,profiles:[...stored.profiles].reverse()};
  assert.equal((await b.request({type:'SAVE_NAVIGATION_MODE_MAPPINGS',websiteChanges:{'example.com':{expected:reordered,value:stored}}})).success,false);
  // Plain binding maps have the same key-order-independent comparison.
  b.data.navigationModeDefaultMapping = {custom:'one',other:'two'};
  assert.equal((await b.request({type:'SAVE_NAVIGATION_MODE_MAPPINGS',defaultChange:{expected:{other:'two',custom:'one'},value:{custom:'new',other:'two'}}})).success,true);
});

test('browser actions accept same-origin SPA paths but reject cross-origin navigation and subframes', async () => {
  const b = await background({sourceUrl:'https://example.com/watch/123?autoplay=1#player'});
  await b.request({type:'SET_NAVIGATION_MODE',enabled:true});
  const sender = {id:'extension',frameId:0,url:'https://example.com/home',tab:{id:7,url:'https://example.com/watch/123?autoplay=1#player'}};
  assert.equal((await b.request({type:'BROWSER_ACTION',action:'next_tab'},sender)).success,true);
  const crossed = {...sender,url:'https://other.example/home'};
  assert.equal((await b.request({type:'BROWSER_ACTION',action:'next_tab'},crossed)).success,false);
  const schemeChanged = {...sender,url:'http://example.com/home'};
  assert.equal((await b.request({type:'BROWSER_ACTION',action:'next_tab'},schemeChanged)).success,false);
  assert.equal((await b.request({type:'BROWSER_ACTION',action:'next_tab'},{...sender,frameId:1})).success,false);
});

test('the Settings tab has independent Navigation profiles and uses the browser tab actions', async () => {
  const { OPTIONS_MAPPING_KEY } = schema();
  const settingsUrl = 'chrome-extension://extension/options/options.html';
  const settingsTab = { id: 7, active: true, index: 1, windowId: 1, url: settingsUrl + '?site=example.com' };
  const websiteTab = { id: 6, active: false, index: 0, windowId: 1, url: 'https://example.com/' };
  const otherTab = { id: 8, active: false, index: 2, windowId: 1, url: 'https://other.example/' };
  const b = await background({ tabs: [websiteTab, settingsTab, otherTab], data: {
    websiteMappings: { [OPTIONS_MAPPING_KEY]: { 2: 'prev_tab' }, 'example.com': { 9: 'search' } }
  } });
  const sender = { id: 'extension', frameId: 0, url: settingsUrl, tab: settingsTab };
  const nextTab = { type: 'BROWSER_ACTION', action: 'next_tab' };
  assert.equal((await b.request(nextTab, sender)).success, false);
  assert.equal((await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true })).success, true);

  const current = await b.request({ type: 'GET_NAVIGATION_PROFILE' }, sender);
  assert.equal(current.success, true);
  assert.equal(current.hostname, OPTIONS_MAPPING_KEY);
  assert.equal(current.profile.bindings[2], 'prev_settings_section');
  assert.equal(current.profile.bindings[6], 'prev_tab');
  assert.equal(current.profile.bindings[7], 'next_tab');
  const set = current.profileSet;
  set.profiles.push({ profileId: 2, name: 'Settings alternate', bindings: { ...current.profile.bindings, 2: 'none' } });
  set.profileShortcuts.closeTab = [8, 9];
  set.nextProfileId = 3;
  assert.equal((await b.request({ type: 'SAVE_NAVIGATION_MODE_MAPPINGS', websiteChanges: {
    [OPTIONS_MAPPING_KEY]: { expected: null, value: set }
  } })).success, true);
  const switched = await b.request({ type: 'SWITCH_NAVIGATION_PROFILE', direction: 'next' }, sender);
  assert.equal(switched.profile.name, 'Settings alternate');
  assert.equal(switched.profileSet.profileShortcuts.closeTab.join(','), '8,9');
  const website = await b.request({ type: 'GET_NAVIGATION_PROFILE' }, { ...sender, tab: websiteTab, url: websiteTab.url });
  assert.equal(website.profileId, 1);
  assert.equal(website.profileSet.profileShortcuts.closeTab, null);

  assert.equal((await b.request(nextTab, sender)).success, true);
  assert.equal((await b.request({ ...nextTab, action: 'prev_tab' }, sender)).success, true);
  assert.deepEqual(b.activatedTabs.map(tab => tab.id), [8, 6]);
  assert.equal((await b.request({ type: 'OPEN_BROWSE' }, sender)).success, true);
  assert.match(b.createdTabs[0].url, /browse\/browse.html\?sourceTabId=7$/);
  const close = { ...nextTab, action: 'close_tab' };
  assert.equal((await b.request(close, { ...sender, frameId: 1 })).success, false);
  settingsTab.active = false;
  assert.equal((await b.request(close, sender)).success, false);
  settingsTab.active = true;
  settingsTab.url = 'https://example.com/';
  assert.equal((await b.request(close, sender)).success, false);
  settingsTab.url = settingsUrl;
  assert.equal((await b.request(close, sender)).success, true);
  assert.deepEqual(b.closedTabs, [7]);
  assert.equal(b.data.websiteMappings[OPTIONS_MAPPING_KEY][2], 'prev_tab');
});

test('Browse switches relative to its own tab and gets a close shortcut from its linked source', async () => {
  const source = { id: 6, active: true, index: 0, windowId: 1, url: 'https://example.com/' };
  const other = { id: 8, active: false, index: 2, windowId: 1, url: 'https://other.example/' };
  const hidden = { id: 9, index: 1, windowId: 1, hidden: true };
  const tabs = [source, hidden, other];
  const b = await background({ tabs });
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: true });
  b.data.navigationModeWebsiteMappings['example.com'].profileShortcuts.closeTab = [4, 5];
  assert.equal((await b.request({ type: 'OPEN_BROWSE' }, { id: 'extension', frameId: 0, url: source.url, tab: source })).success, true);
  const browse = { id: 100, active: true, index: 1, windowId: 1, url: b.createdTabs[0].url };
  tabs.push(browse);
  source.active = false;
  const sender = { id: 'extension', frameId: 0, url: browse.url, tab: browse };
  const context = { type: 'GET_BROWSE_CONTEXT' };
  const response = await b.request(context, { ...sender, url: browse.url.replace('sourceTabId=6', 'sourceTabId=8') });
  assert.equal(response.sourceTab.id, 6);
  assert.equal(response.profileShortcuts.closeTab.join(','), '4,5');
  assert.equal((await b.request(context, { ...sender, frameId: 1 })).success, false);

  const command = { type: 'BROWSER_ACTION' };
  assert.equal((await b.request({ ...command, action: 'next_tab' }, sender)).switched, true);
  assert.equal((await b.request({ ...command, action: 'prev_tab' }, sender)).switched, true);
  assert.deepEqual(b.activatedTabs.map(tab => tab.id), [8, 6]);
  browse.active = false;
  assert.equal((await b.request({ ...command, action: 'next_tab' }, sender)).success, false);
  browse.active = true;
  await b.request({ type: 'SET_NAVIGATION_MODE', enabled: false });
  assert.equal((await b.request(context, sender)).profileShortcuts, null);
  tabs.splice(0, 3);
  assert.equal((await b.request(context, sender)).sourceTab, null);
  assert.equal((await b.request({ ...command, action: 'next_tab' }, sender)).switched, false);
});

test('Browse removes its own tab after a destination opens and stays open on failure', async () => {
  const file = fs.readFileSync(path.join(root, 'browse/browse.js'), 'utf8');
  const calls = [];
  const status = {};
  let createError = false;
  let searchAllowed = false;
  const chrome = {
    tabs: {
      get: async id => ({ id, windowId: 3 }),
      update: async id => calls.push(['activate', id]),
      query: async () => [{ id: 20, url: 'https://example.com/' }],
      async create({ url }) {
        calls.push(['create', url]);
        if (createError) throw new Error('Cannot open tab');
        return { id: 21 };
      },
      remove: async id => calls.push(['remove', id])
    },
    windows: { update: async id => calls.push(['focus', id]) },
    permissions: { contains: async () => searchAllowed },
    search: { query: async () => { throw new Error('Search unavailable'); } }
  };
  const context = vm.createContext({
    chrome, URL, document: { getElementById: () => status }, window: {}, RemapadNavigationMode: schema()
  });
  vm.runInContext(file.slice(0, file.indexOf('function row(item)')), context);
  vm.runInContext('browseTabId = 10; capabilities = async () => {}; suggest = async () => {}; permissionHelp = () => {};', context);

  await vm.runInContext("navigate({ url: 'https://example.com' })", context);
  assert.deepEqual(calls.splice(0), [['activate', 20], ['focus', 3], ['remove', 10]]);
  await vm.runInContext("Promise.all([navigate({url:'https://other.example/'}), navigate({url:'https://third.example/'})])", context);
  assert.deepEqual(calls.splice(0), [['create', 'https://other.example/'], ['remove', 10]]);

  createError = true;
  await vm.runInContext("navigate({ url: 'https://other.example/' })", context);
  assert.deepEqual(calls.splice(0), [['create', 'https://other.example/']]);
  assert.match(status.textContent, /Could not open/);
  createError = false;
  await vm.runInContext("navigate({ search: 'query' })", context);
  assert.deepEqual(calls, []);
  searchAllowed = true;
  await vm.runInContext("navigate({ search: 'query' })", context);
  assert.deepEqual(calls, [['create', 'about:blank'], ['remove', 21]]);
});
