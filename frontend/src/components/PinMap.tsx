import BasePinMap from "./map/BasePinMap";

/** Small static or draggable single-pin map (detail page, flag dialogs). */
export default function PinMap({
  lat,
  lng,
  draggable,
  onChange,
  height,
}: {
  lat: number;
  lng: number;
  draggable?: boolean;
  onChange?: (p: { lat: number; lng: number }) => void;
  height?: number;
}) {
  return <BasePinMap lat={lat} lng={lng} draggable={draggable} onChange={onChange} height={height} />;
}
