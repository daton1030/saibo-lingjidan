import { formatLastRun } from "../scheduler/shell.js";

window.saiboClaim = { formatLastRun };
if (typeof window.saiboRefreshClaimPanel === "function") window.saiboRefreshClaimPanel();
