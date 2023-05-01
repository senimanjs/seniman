import { createInternalModule, createModule } from "./module.js";
import { useClient } from './window.js';

export const CoreNetworkModule = createInternalModule(1);

export let NetworkManagerModule = createModule($c(() => {
  let coreNetwork = $s(CoreNetworkModule);
  let requestReopen = false;

  coreNetwork.onClose(() => {
    requestReopen = true;
  });

  coreNetwork.onError(() => {
    requestReopen = true;
  });

  let lastIntervalTime = Date.now();
  let pingWaitCounter = 0;

  let setIntervalFn = () => setInterval(() => {
    let _now = Date.now();
    let lastMessageTime = coreNetwork.lastMessageTime();
    let pingLate = (_now - lastMessageTime) > 4000;
    let intervalTimeDiff = (_now - lastIntervalTime);

    lastIntervalTime = _now;

    if (lastMessageTime > 0 && !pingLate && !requestReopen) {

      if (pingWaitCounter > 0) {
        pingWaitCounter = 0;
        callbacks.connected.forEach(cb => cb());
      }

      return;
    }

    // TODO: do different things based on if sleep is longer than the window-destroy timeout on the server side?
    // i.e. if we reconnect to a new window (because existing window has been destroyed), we might want to confirm to 
    // the user that we'll refresh the content.
    // if we're reconnecting to an existing window, content should change naturally and no user prompting is needed.
    let postPageSleepExecution = intervalTimeDiff > 10000;

    // when the page wakes from sleep, give it another chance from clean slate.
    if (postPageSleepExecution) {
      pingWaitCounter = 0;
    }

    pingWaitCounter++;

    let shouldRecreateSocket = postPageSleepExecution || requestReopen || pingWaitCounter % 3 == 0;

    if (shouldRecreateSocket) {
      requestReopen = false;
      lastMessageTime = 0;

      coreNetwork.reconnect();

      callbacks.reconnecting.forEach(cb => cb());
    }

    if (pingWaitCounter == 20) {
      coreNetwork.close();
      clearInterval(intv);

      callbacks.disconnected.forEach(cb => cb());
    }
  }, 500);

  // pingchecker
  let intv = setIntervalFn();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState == 'visible') {
      // TODO: should run this immediately
      intv = setIntervalFn();
    } else {
      clearInterval(intv);
    }
  });

  let callbacks = {
    reconnecting: [],
    disconnected: [],
    connected: []
  };

  return {
    on: (eventName, callback) => {
      callbacks[eventName].push(callback);
    }
  }
}));

export function DefaultNetworkStatusView() {
  let client = useClient();

  setTimeout(() => {

    client.exec($c(() => {
      let networkStatus = $s(NetworkManagerModule);
      let reconn = document.getElementById('reconn');
      let disconn = document.getElementById('disconn');

      networkStatus.on('reconnecting', () => {
        reconn.style.display = 'block';
        disconn.style.display = 'none';
      });

      networkStatus.on('disconnected', () => {
        reconn.style.display = 'none';
        disconn.style.display = 'block';
      });

      networkStatus.on('connected', () => {
        reconn.style.display = 'none';
        disconn.style.display = 'none';
      });
    }));
  }, 0);

  return <div>
    <div id='reconn' style={{ display: 'none', position: 'fixed', bottom: '10%', padding: '10px', 'font-size': '15px', background: '#eee', border: '1px solid #ccc', left: 'calc(50% - 60px)' }}>
      Reconnecting...
    </div>
    <div id='disconn' style={{ display: 'none', position: 'fixed', bottom: '10%', padding: '10px', 'font-size': '15px', background: '#eee', border: '1px solid #ccc', left: 'calc(50% - 60px)' }}>
      Disconnected
      <button onclick="location.reload();">Reload</button>
    </div>
  </div>
}
