// Agon Module — background. Creates the toolbar tool ONLY for the GM.
// Players' clients never register the tool, so they get no button.
import OBR from "@owlbear-rodeo/sdk";

const V = "1.0.0";
const TOOL = "com.agon.module/tool";
const POP = "com.agon.module/popover";
const base = new URL(".", location.href);
const chan = new BroadcastChannel("agon-module");
let made = false;
let open = false;

chan.onmessage = (e) => {
  if (e.data === "closed") open = false;
  if (e.data === "opened") open = true;
};

function prefs() {
  try { return JSON.parse(localStorage.getItem("agon-module:prefs") || "{}"); } catch { return {}; }
}

export async function sizeFor(full) {
  const vw = await OBR.viewport.getWidth();
  const vh = await OBR.viewport.getHeight();
  return {
    vw, vh,
    w: Math.max(420, Math.min(full ? 1320 : 820, vw - 24)),
    h: Math.max(400, Math.min(full ? 1000 : 900, vh - 24)),
  };
}

async function toggle() {
  if (open) { await OBR.popover.close(POP); open = false; return; }
  const p = prefs();
  const { vw, vh, w, h } = await sizeFor(p.size !== "compact");
  await OBR.popover.open({
    id: POP,
    url: new URL("index.html?v=" + V, base).href,
    width: w,
    height: h,
    anchorReference: "POSITION",
    anchorPosition: { left: vw - 12, top: vh / 2 },
    anchorOrigin: { horizontal: "RIGHT", vertical: "CENTER" },
    transformOrigin: { horizontal: "RIGHT", vertical: "CENTER" },
    disableClickAway: true,
  });
  open = true;
}

async function sync(role) {
  if (role === "GM" && !made) {
    made = true;
    await OBR.tool.create({
      id: TOOL,
      icons: [{ icon: new URL("icon.svg", base).href, label: "Historian's Module" }],
      onClick: () => { toggle(); return false; }, // never activates as a map tool
    });
  } else if (role !== "GM" && made) {
    made = false;
    await OBR.tool.remove(TOOL);
    await OBR.popover.close(POP);
    open = false;
  }
}

OBR.onReady(async () => {
  await sync(await OBR.player.getRole());
  OBR.player.onChange((pl) => sync(pl.role));
});
