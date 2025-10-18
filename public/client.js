const out = document.getElementById('output');
const evtSource = new EventSource('/events');

evtSource.onmessage = (e) => {
  out.textContent += e.data + "\n";
  out.scrollTop = out.scrollHeight;
};

evtSource.onerror = (e) => {
  out.textContent += "[SSE] connection error\n";
};
