// MediaStreamHandler.tsx

import { Device } from "mediasoup-client";
import { Transport } from "mediasoup-client/lib/types";
import { useState, useEffect } from "react";
import { StreamData } from "../App";
import { consumeStream, socket } from "../utils/utils";

interface MediaStreamHandlerProps {
  setStreams: React.Dispatch<React.SetStateAction<StreamData[]>>;
  setVideoStreams: React.Dispatch<
    React.SetStateAction<{ [key: string]: MediaStream }>
  >;
  setAudioStreams: React.Dispatch<
    React.SetStateAction<{ [key: string]: MediaStream }>
  >;
}

const MediaStreamHandler: React.FC<MediaStreamHandlerProps> = ({
  setStreams,
  setVideoStreams,
  setAudioStreams,
}) => {
  const [device, setDevice] = useState<Device | null>(null);
  const [recvTransports, setRecvTransports] = useState<Map<string, Transport>>(
    new Map()
  );

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
          } catch (error) {
            console.error("❌ Error loading Mediasoup Device:", error);
          }
        }
      );
    }
    initDevice();
    socket.emit("getActiveProducers", async (data) => {
      console.log(data);
    });

    socket.on("newStream", async (data: StreamData) => {
      setStreams((prev) => [...prev, data]);
      await consumeStream(
        data.producerId,
        data.userId,
        device,
        recvTransports,
        setVideoStreams,
        setAudioStreams
      );
    });

    socket.on("streamStopped", ({ userId }) => {
      // Handle stream stopped logic here
    });

    return () => {
      socket.off("newStream");
      socket.off("streamStopped");
    };
  }, [device, recvTransports, setStreams, setVideoStreams, setAudioStreams]);

  return null;
};

export default MediaStreamHandler;
