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

function Working() {
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [videoStreams, setVideoStreams] = useState<{
    [key: string]: MediaStream;
  }>({});
  const [device, setDevice] = useState<Device | null>(null);
  const [recvTransports, setRecvTransports] = useState<Map<string, Transport>>(
    new Map()
  );
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const [forceRender, setForceRender] = useState(false); // 🔥 Force re-render

  useEffect(() => {
    async function initDevice() {
      if (device) return; // Prevent duplicate initialization

      const newDevice = new Device();
      socket.emit("getRouterRtpCapabilities", async (rtpCapabilities: any) => {
        try {
          await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
          setDevice(newDevice);
          console.log("✅ Mediasoup Device Loaded");
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
              const newStreams = { ...prev, [userId]: stream };
              return newStreams;
            });

            setRecvTransports((prev) => {
              const newMap = new Map(prev);
              newMap.set(userId, recvTransport);
              return newMap;
            });

            setForceRender((prev) => !prev); // 🔥 Force a re-render when a new stream is added

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

    setForceRender((prev) => !prev); // 🔥 Force re-render when stream is removed
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
  });

  return (
    <div>
      <h2>Live Streams</h2>
      <div
        id="video-container"
        style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
      >
        {Object.entries(videoStreams).map(([userId]) => (
          <div key={userId}>
            <p>User: {userId}</p>
            <video
              ref={(el) => (videoRefs.current[userId] = el)}
              autoPlay
              controls
              style={{ width: "300px", height: "200px" }}
            />
            <button onClick={() => stopUserStream(userId)}>Stop Stream</button>
          </div>
        ))}
      </div>

      {streams.length === 0 && <p>No active streams</p>}
    </div>
  );
}

export default Working;
