/** Mutable camera snapshot read by HUD widgets (compass, minimap) in their own rAF loops. */
export const camState = {
  target: [0, 0] as [number, number],
  azimuth: 0,
  distance: 700,
  polar: 0.9,
  /** Visible half-extent on the ground in metres (approx.), for the minimap viewport box. */
  halfView: 300,
};
