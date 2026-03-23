export default function SnowLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-gray-900/90 text-white rounded-lg p-3 backdrop-blur-sm text-xs">
      <div className="font-semibold mb-2">Snow Depth (30cm base)</div>
      <div className="flex items-center gap-2">
        <div
          className="w-36 h-3 rounded"
          style={{
            background: "linear-gradient(to right, #8B7765, #C8C0B8, #FFFFFF, #B0E0FF, #00FFDC)",
          }}
        />
      </div>
      <div className="flex justify-between mt-1 text-gray-400 w-36">
        <span>0cm</span>
        <span>15</span>
        <span>30</span>
        <span>60+</span>
        <span className="text-cyan-400">Powder</span>
      </div>
    </div>
  );
}
