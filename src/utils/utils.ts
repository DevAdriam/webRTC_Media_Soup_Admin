/* eslint-disable @typescript-eslint/no-explicit-any */
import { Device } from "mediasoup-client";
import { Consumer, Transport } from "mediasoup-client/lib/types";
import { io } from "socket.io-client";

export const socket = io("http://localhost:3000", {
  transports: ["websocket", "polling"],
});

export async function consumeStream(
  producerId: string,
  userId: string,
  device: Device | null,
  recvTransports: Map<string, Transport>,
  setVideoStreams: React.Dispatch<
    React.SetStateAction<{ [key: string]: MediaStream }>
  >,
  setAudioStreams: React.Dispatch<
    React.SetStateAction<{ [key: string]: MediaStream }>
  >
) {
  if (!device) {
    console.error("❌ Device not initialized yet");
    return;
  }

  if (recvTransports.has(userId)) {
    console.log(`❌ User ${userId} is already consuming a stream`);
    return;
  }

  socket.emit(
    "createTransport",
    { type: "recv" },
    async (transportOptionsString: any) => {
      const transportOptions = transportOptionsString;
      if (!transportOptions || !transportOptions?.id) {
        console.error("❌ Failed to get transport options from server");
        return;
      }

      const recvTransport = device.createRecvTransport(transportOptions);

      recvTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          socket.emit(
            "connectTransport",
            { transportId: transportOptions.id, dtlsParameters },
            (response: any) => {
              if (response?.error) {
                errback(response.error);
              } else {
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
          const consumer: Consumer = await recvTransport.consume(
            consumerOptions
          );

          if (!consumer.track) {
            console.error("❌ Consumer track is missing");
            return;
          }

          const stream = new MediaStream();
          stream.addTrack(consumer.track);

          if (consumerOptions.kind === "video") {
            setVideoStreams((prev) => ({ ...prev, [userId]: stream }));
          } else {
            setAudioStreams((prev) => ({ ...prev, [userId]: stream }));
          }
        }
      );
    }
  );
}

export function stopUserStream(
  userId: string,
  setVideoStreams: React.Dispatch<
    React.SetStateAction<{ [key: string]: MediaStream }>
  >,
  setAudioStreams: React.Dispatch<
    React.SetStateAction<{ [key: string]: MediaStream }>
  >
) {
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
}
