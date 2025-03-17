import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { Device, Transport, Consumer } from "mediasoup-client";

const socket = io("http://localhost:3000", {
  transports: ["websocket", "polling"],
});

interface StreamData {
  userId: string;
  producerId: string;
}

function App() {
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [audioStreams, setAudioStreams] = useState<{
    [key: string]: MediaStream;
  }>({});
  const [videoStreams, setVideoStreams] = useState<{
    [key: string]: MediaStream;
  }>({});
  const [device, setDevice] = useState<Device | null>(null);
  const [recvTransports, setRecvTransports] = useState<Map<string, Transport>>(
    new Map()
  );
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const [forceRender, setForceRender] = useState(false);

  useEffect(() => {
    async function initDevice() {
      if (device) return;
      const newDevice = new Device();

      socket.emit(
        "getRouterRtpCapabilities",
        {},
        async (rtpCapabilitiesString: any) => {
          try {
            const rtpCapabilities = rtpCapabilitiesString;
            await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
            setDevice(newDevice);
            console.log("✅ Mediasoup Device Loaded : ", newDevice);
          } catch (error) {
            console.error("❌ Error loading Mediasoup Device:", error);
          }
        }
      );
    }
    initDevice();

    socket.on("newStream", async (data: StreamData) => {
      console.log(`📡 New stream received:`, data);
      setStreams((prev) => [...prev, data]);
      await waitForDevice();
      await consumeStream(data.producerId, data.userId);
    });

    socket.on("streamStopped", ({ userId }) => {
      stopUserStream(userId);
    });

    return () => {
      socket.off("newStream");
      socket.off("streamStopped");
    };
  }, [device]);

  // Fetch the currently active producers
  useEffect(() => {
    async function fetchActiveProducers() {
      await waitForDevice(); // Ensure the device is loaded
      socket.emit(
        "getActiveProducers",
        {},
        async (activeProducers: StreamData[]) => {
          console.log("📡 Active producers fetched:", activeProducers);
          setStreams(activeProducers);

          for (const producer of activeProducers) {
            await consumeStream(producer.producerId, producer.userId);
          }
        }
      );
    }

    fetchActiveProducers(); // Fetch when component mounts
  }, [device]);

  async function waitForDevice() {
    return new Promise<void>((resolve) => {
      const checkDevice = setInterval(() => {
        if (device) {
          clearInterval(checkDevice);
          resolve();
        }
      }, 100);
    });
  }

  // Consume a stream for a producer
  async function consumeStream(producerId: string, userId: string) {
    if (!device) {
      console.error("❌ Device not initialized yet");
      return;
    }

    console.log(
      `📥 Requesting consumer transport for producerId: ${producerId}`
    );

    // Check if the user already has a transport to prevent re-creating the transport
    if (recvTransports.has(userId)) {
      console.log(`❌ User ${userId} is already consuming a stream`);
      return; // Don't consume the stream again if already active
    }

    socket.emit(
      "createTransport",
      { type: "recv" },
      async (transportOptionsString: any) => {
        const transportOptions = transportOptionsString;
        if (!transportOptions || !transportOptions.id) {
          console.error("❌ Failed to get transport options from server");
          return;
        }

        console.log("🛠️ Creating receive transport...", transportOptions);
        const recvTransport = device.createRecvTransport(transportOptions);

        recvTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            console.log("🔗 Connecting transport...");
            socket.emit(
              "connectTransport",
              { transportId: transportOptions.id, dtlsParameters },
              (response: any) => {
                if (response?.error) {
                  console.error(
                    "❌ Transport connection failed:",
                    response.error
                  );
                  errback(response.error);
                } else {
                  console.log("✅ Transport connected successfully!");
                  callback();
                }
              }
            );
          }
        );

        socket.emit(
          "consume",
          { transportId: transportOptions.id, producerId },
          async (consumerOptions: {
            id: string;
            producerId: string;
            kind: "video" | "audio";
            rtpParameters: any;
          }) => {
            if (!consumerOptions || !consumerOptions.id) {
              console.error("❌ Failed to get consumer options");
              return;
            }

            console.warn("🎥 Consume response received:", consumerOptions);
            const consumer: Consumer = await recvTransport.consume(
              consumerOptions
            );

            if (!consumer.track) {
              console.error("❌ Consumer track is missing");
              return;
            }

            const stream = new MediaStream();
            stream.addTrack(consumer.track);

            consumerOptions.kind === "video"
              ? setVideoStreams((prev) => ({ ...prev, [userId]: stream }))
              : setAudioStreams((prev) => ({ ...prev, [userId]: stream }));

            setRecvTransports((prev) => {
              const newMap = new Map(prev);
              newMap.set(userId, recvTransport);
              return newMap;
            });

            setForceRender((prev) => !prev);
            console.log(`✅ Stream added for user: ${userId}`);
          }
        );
      }
    );
  }

  // Stop a user's stream
  function stopUserStream(userId: string) {
    console.log(`🛑 Stopping stream for user: ${userId}`);
    socket.emit("stopStream", { userId });

    setVideoStreams((prev) => {
      const updatedStreams = { ...prev };
      delete updatedStreams[userId];
      return updatedStreams;
    });

    setAudioStreams((prev) => {
      const updatedStreams = { ...prev };
      delete updatedStreams[userId];
      return updatedStreams;
    });

    const transport = recvTransports.get(userId);
    if (transport) {
      transport.close();
      recvTransports.delete(userId);
    }

    setForceRender((prev) => !prev);
  }

  // Render video streams
  useEffect(() => {
    Object.entries(videoStreams).forEach(([userId, stream]) => {
      if (!stream) {
        console.warn(`⚠️ No valid stream for user ${userId}`);
        return;
      }
      let videoElement = videoRefs.current[userId];

      if (!videoElement) {
        console.error(`❌ No video element found for user ${userId}`);
        return;
      }

      if (videoElement.srcObject !== stream) {
        console.log(`🎬 Attaching stream to video element for user ${userId}`);
        videoElement.srcObject = stream;
        videoElement.muted = false;
        videoElement.autoplay = true;
        videoElement.controls = true;
      }

      if (stream.getVideoTracks().length > 0) {
        const videoTrack = stream.getVideoTracks()[0];

        if (!videoTrack.enabled) {
          console.log("video track is not enabled");
        } else {
          videoTrack.enabled = true;
        }

        videoElement
          .play()
          .catch((err) =>
            console.error(`🔴 Video play error for user ${userId}:`, err)
          );
      }
    });
  }, [videoStreams, forceRender]);

  // Render audio streams
  useEffect(() => {
    Object.entries(audioStreams).forEach(([userId, stream]) => {
      if (stream.getAudioTracks().length > 0) {
        const audioElementId = userId;
        let audioElement = document.getElementById(
          audioElementId
        ) as HTMLAudioElement;

        if (!audioElement) {
          console.log(`🎤 Creating new audio element for user ${userId}`);
          audioElement = document.createElement("audio");
          audioElement.id = audioElementId;
          audioElement.autoplay = true;
          audioElement.controls = false;
          document.body.appendChild(audioElement);
        }

        if (audioElement.srcObject !== stream) {
          console.log(`🔊 Attaching audio stream for user ${userId}`);
          audioElement.srcObject = stream;
        }
      }
    });
  }, [audioStreams, forceRender]);

  return (
    <div className="min-w-screen min-h-screen bg-gray-900 text-white p-5">
      <h2 className="text-2xl font-bold text-center mb-5">📡 Live Streams</h2>

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

      {streams.length === 0 && (
        <p className="text-center mt-10 text-gray-400">No active streams</p>
      )}
    </div>
  );
}

export default App;
