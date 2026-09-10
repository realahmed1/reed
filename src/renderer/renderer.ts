import { initializeReader } from "./reader";

initializeReader({
  ...window.reed,
  capabilities: { clipboard: true, clarification: true, localVoicesOnly: false }
});
