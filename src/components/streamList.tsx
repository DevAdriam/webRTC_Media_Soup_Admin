// StreamList.tsx
import React, { useEffect, useRef } from "react";

interface StreamListProps {
  videoStreams: { [key: string]: MediaStream };
  audioStreams: { [key: string]: MediaStream };
  stopUserStream: (userId: string) => void;
}

const StreamList: React.FC<StreamListProps> = ({
  videoStreams,
  audioStreams,
  stopUserStream,
}) => {
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  useEffect(() => {
    Object.entries(videoStreams).forEach(([userId, stream]) => {
      const videoElement = videoRefs.current[userId];

      if (videoElement && stream) {
        videoElement.srcObject = stream;
      }
    });
  }, [videoStreams]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
      {Object.entries(videoStreams).map(([userId]) => (
        <div key={userId} className="bg-gray-800 p-4 rounded-lg shadow-lg">
          <p className="text-lg font-semibold">🎥 User: {userId}</p>
          <video
            ref={(el) => (videoRefs.current[userId] = el)}
            autoPlay={false}
            controls
            className="w-full h-56 bg-black rounded-md shadow-md"
          />
          <button
            onClick={() => stopUserStream(userId)}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md w-full transition cursor-pointer"
          >
            🛑 Stop Stream
          </button>
        </div>
      ))}
    </div>
  );
};

export default StreamList;
