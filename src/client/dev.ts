const dev = (reconnect?: boolean) => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${wsProtocol}://${window.location.host}/dev-ws`);
    socket.onclose = () => {
        socket.close();
        console.log("websocket connection lost reconnecting");
        dev(reconnect || true);
    }
    socket.onerror = () => {
        socket.close();
        console.log("websocket connection lost reconnecting");
        dev(reconnect || true);
    }
    socket.onopen = () => {
        if (reconnect) {
            console.log("websocket connection back reloading to ensure latest");
            window.location.reload();
        }
    }
    socket.onmessage = () => {
        console.log("website updated reloading");
        window.location.reload();
    };
}
export default dev;