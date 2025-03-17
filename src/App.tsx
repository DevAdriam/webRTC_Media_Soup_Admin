import { useState } from "react";
import MediaStreamHandler from "./components/mediastreamHandler";
import StreamList from "./components/streamList";
import { stopUserStream } from "./utils/utils";

export interface StreamData {
  userId: string;
  producerId: string;
}

const App: React.FC = () => {
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [videoStreams, setVideoStreams] = useState<{
    [key: string]: MediaStream;
  }>({});
  const [audioStreams, setAudioStreams] = useState<{
    [key: string]: MediaStream;
  }>({});

  return (
    <div className="min-w-screen min-h-screen bg-gray-900 text-white p-5">
      <h2 className="text-2xl font-bold text-center mb-5">📡 Live Streams</h2>

      <MediaStreamHandler
        setStreams={setStreams}
        setVideoStreams={setVideoStreams}
        setAudioStreams={setAudioStreams}
      />

      <StreamList
        videoStreams={videoStreams}
        audioStreams={audioStreams}
        stopUserStream={(userId: string) =>
          stopUserStream(userId, setVideoStreams, setAudioStreams)
        }
      />

      {streams.length === 0 && (
        <p className="text-center mt-10 text-gray-400">No active streams</p>
      )}
    </div>
  );
};

export default App;
