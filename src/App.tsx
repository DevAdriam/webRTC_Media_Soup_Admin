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
      socket.emit("getRouterRtpCapabilities", async (rtpCapabilities: any) => {
        try {
          await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
          setDevice(newDevice);
          console.log("✅ Mediasoup Device Loaded : ", newDevice);

          socket.emit("getProducers", async (producers: StreamData[]) => {
            for (const producer of producers) {
              await consumeStream(producer.producerId, producer.userId);
            }
          });
        } catch (error) {
          console.error("❌ Error loading Mediasoup Device:", error);
        }
      });
    }

    initDevice();

    socket.on("newStream", async (data: StreamData) => {
      console.log(`📡 New stream received:`, data);
      setStreams((prev) => [...prev, data]);

      await waitForDevice();
      consumeStream(data.producerId, data.userId);
    });

    socket.on("streamStopped", ({ userId }) => {
      stopUserStream(userId);
    });

    return () => {
      socket.off("newStream");
      socket.off("streamStopped");
    };
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

  async function consumeStream(producerId: string, userId: string) {
    console.log(device);
    if (!device) {
      console.error("❌ Device not initialized yet");
      return;
    }

    console.log(
      `📥 Requesting consumer transport for producerId: ${producerId}`
    );
    socket.emit(
      "createTransport",
      { type: "recv" },
      async (transportOptions: any) => {
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
          async (consumerOptions: any) => {
            if (!consumerOptions || !consumerOptions.id) {
              console.error("❌ Failed to get consumer options");
              return;
            }

            console.log("🎥 Consume response received:", consumerOptions);
            const consumer: Consumer = await recvTransport.consume(
              consumerOptions
            );

            if (!consumer.track) {
              console.error("❌ Consumer track is missing");
              return;
            }

            console.log(`🎬 Adding video track for user ${userId}`);
            consumer.track.enabled = true;

            const stream = new MediaStream();
            stream.addTrack(consumer.track);

            setVideoStreams((prev) => {
              console.log("Setting video streams");
              return { ...prev, [userId]: stream };
            });

            setRecvTransports((prev) => {
              const newMap = new Map(prev);
              newMap.set(userId, recvTransport);
              return newMap;
            });

            setForceRender((prev) => !prev);
            console.log(`✅ Video stream added for user: ${userId}`);
          }
        );
      }
    );
  }

  function stopUserStream(userId: string) {
    console.log(`🛑 Stopping stream for user: ${userId}`);
    socket.emit("stopStream", { userId });

    setVideoStreams((prev) => {
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

  useEffect(() => {
    console.log({ videoStreams });

    Object.entries(videoStreams).forEach(([userId, stream]) => {
      const videoElement = videoRefs.current[userId];

      if (videoElement && stream) {
        if (videoElement.srcObject !== stream) {
          console.log(
            `🎬 Attaching stream to video element for user ${userId}`
          );
          videoElement.srcObject = stream;
        }

        videoElement
          .play()
          .catch((err) => console.error("🔴 Video play error:", err));
      }
    });
  }, [videoStreams, forceRender]);

  return (
    <div className="min-h-screen min-w-screen bg-gray-900 text-white p-5">
      <h2 className="text-2xl font-bold text-center mb-5">📡 Live Streams</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {Object.entries(videoStreams).map(([userId]) => (
          <div key={userId} className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <p className="text-lg font-semibold">🎥 User: {userId}</p>
            <video
              ref={(el) => (videoRefs.current[userId] = el)}
              autoPlay
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
