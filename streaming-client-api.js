'use strict';
const fetchJsonFile = await fetch('./api.json');
const DID_API = await fetchJsonFile.json();

// OpenAI 함수
async function callOpenAI(userInput) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DID_API.openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: '질문에 대해 간결하게 답변해 주세요. 마크업 기능은 활용하지 마세요.' },
                    { role: 'user', content: userInput }
                ]
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API Error:', error);
        return '죄송합니다. 응답 생성 중 오류가 발생했습니다.';
    }
}

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let pcDataChannel;
let streamId;
let sessionId;
let sessionClientAnswer;

let statsIntervalId;
let lastBytesReceived;
let videoIsPlaying = false;
let streamVideoOpacity = 0;

const stream_warmup = true;
let isStreamReady = !stream_warmup;

const idleVideoElement = document.getElementById('idle-video-element');
const streamVideoElement = document.getElementById('stream-video-element');
idleVideoElement.setAttribute('playsinline', '');
streamVideoElement.setAttribute('playsinline', '');

// 상태 label들은 UI에서 제거되었으므로 null 처리
const peerStatusLabel = null;
const iceStatusLabel = null;
const iceGatheringStatusLabel = null;
const signalingStatusLabel = null;
const streamingStatusLabel = null;
const streamEventLabel = null;

// 연결 상태 메시지 요소
const connectionStatus = document.getElementById('connection-status');
const subtitleElement = document.getElementById('subtitle');

const presenterInputByService = {
  talks: {
    source_url: 'https://symmetrical-rotary-phone-wrwp6v4p7rx2g6p-8000.app.github.dev/my-photo.jpg',
  },
  clips: {
    presenter_id: 'v2_public_Alyssa_NoHands_BlackShirt_Home@Mvn6Nalx90',
  },
};

// 내부적으로 사용할 연결 함수 (자동 연결에서만 사용)
async function connectToStream() {
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }

  stopAllStreams();
  closePC();

  const sessionResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...presenterInputByService[DID_API.service], stream_warmup }),
  });

  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;

  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  const sdpResponse = await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
}

async function startStreamWithScript(script) {
  console.log('=== startStreamWithScript DEBUG ===');
  console.log('peerConnection?.signalingState:', peerConnection?.signalingState);
  console.log('peerConnection?.iceConnectionState:', peerConnection?.iceConnectionState);
  console.log('isStreamReady:', isStreamReady);

  if (
    (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') &&
    isStreamReady
  ) {
    const response = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        config: { 
          stitch: true,
          auto_match: true,
          normalization_factor: 1.0,
          sharpen: true,
          align_driver: true
        },
        session_id: sessionId,
        ...(DID_API.service === 'clips' && {
          background: { color: '#FFFFFF' },
        }),
      }),
    });

    return response;
  }
}

// 음성 인식 설정
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'ko-KR';
recognition.continuous = false;

let isRecognizing = false;

recognition.onresult = async (event) => {
    const userInput = event.results[0][0].transcript;
    console.log('User input:', userInput);
    
    // 사용자 입력 자막 표시
    if (subtitleElement) {
        subtitleElement.style.display = 'block';
        subtitleElement.textContent = `👤 ${userInput}`;
    }
    
    const aiResponse = await callOpenAI(userInput);
    console.log('AI Response:', aiResponse);
    
    // AI 응답 자막 표시
    if (subtitleElement) {
        subtitleElement.textContent = `🤖 ${aiResponse}`;
    }
    
    const script = {
        type: 'text',
        provider: { type: 'microsoft', voice_id: 'ko-KR-InJoonNeural' },
        input: aiResponse,
        ssml: false
    };
    
    console.log('=== Calling startStreamWithScript ===');
    console.log('Script:', script);
    console.log('Script.input length:', script.input.length);
    
    const result = await startStreamWithScript(script);
    
    console.log('=== startStreamWithScript completed ===');
    console.log('Result:', result);
};

recognition.onend = () => {
    isRecognizing = false;
    console.log('음성 인식 종료');
};

// 음성 인식 재시작 버튼
document.getElementById('mic-button')?.addEventListener('click', () => {
    if (isRecognizing) {
        recognition.stop();
        isRecognizing = false;
    }
    
    setTimeout(() => {
        try {
            recognition.start();
            isRecognizing = true;
            console.log('🎤 음성 인식 재시작');
        } catch (e) {
            console.log('음성 인식 시작 실패:', e.message);
        }
    }, 100);
});

// 종료 버튼
const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};

function onIceGatheringStateChange() {
  if (iceGatheringStatusLabel) {
    iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
    iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
  }
}

function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  } else {
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });
  }
}

function onIceConnectionStateChange() {
  if (iceStatusLabel) {
    iceStatusLabel.innerText = peerConnection.iceConnectionState;
    iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  }
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}

function onConnectionStateChange() {
  if (peerStatusLabel) {
    peerStatusLabel.innerText = peerConnection.connectionState;
    peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
  }
  if (peerConnection.connectionState === 'connected') {
    playIdleVideo();
    setTimeout(() => {
      if (!isStreamReady) {
        console.log('forcing stream/ready');
        isStreamReady = true;
        if (streamEventLabel) {
          streamEventLabel.innerText = 'ready';
          streamEventLabel.className = 'streamEvent-ready';
        }
      }
    }, 5000);
  }
}

function onSignalingStateChange() {
  if (signalingStatusLabel) {
    signalingStatusLabel.innerText = peerConnection.signalingState;
    signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
  }
}

function onVideoStatusChange(videoIsPlaying, stream) {
  let status;

  if (videoIsPlaying) {
    status = 'streaming';
    streamVideoOpacity = 1;
    setStreamVideoElement(stream);
  } else {
    status = 'empty';
    streamVideoOpacity = 0;
  }

  streamVideoElement.style.opacity = streamVideoOpacity;
  idleVideoElement.style.opacity = 1 - streamVideoOpacity;

  if (streamingStatusLabel) {
    streamingStatusLabel.innerText = status;
    streamingStatusLabel.className = 'streamingState-' + status;
  }
}

function onTrack(event) {
  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}

function onStreamEvent(message) {
  if (pcDataChannel.readyState === 'open') {
    let status;
    const [event, _] = message.data.split(':');

    switch (event) {
      case 'stream/started':
        status = 'started';
        break;
      case 'stream/done':
        status = 'done';
        // 아바타가 말을 끝냈을 때 음성 인식 재시작
        setTimeout(() => {
          if (peerConnection?.connectionState === 'connected' && !isRecognizing) {
            try {
              recognition.start();
              isRecognizing = true;
              console.log('🎤 아바타 응답 완료 후 음성 인식 재시작');
            } catch (e) {
              console.log('음성 인식 재시작 실패:', e.message);
            }
          }
        }, 1000);
        break;
      case 'stream/ready':
        status = 'ready';
        break;
      case 'stream/error':
        status = 'error';
        break;
      default:
        status = 'dont-care';
        break;
    }

    if (status === 'ready') {
      setTimeout(() => {
        console.log('stream/ready');
        isStreamReady = true;
        if (streamEventLabel) {
          streamEventLabel.innerText = 'ready';
          streamEventLabel.className = 'streamEvent-ready';
        }
      }, 1000);
    } else {
      console.log(event);
      if (streamEventLabel) {
        streamEventLabel.innerText = status === 'dont-care' ? event : status;
        streamEventLabel.className = 'streamEvent-' + status;
      }
    }
  }
}

async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
    pcDataChannel.addEventListener('message', onStreamEvent, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  return sessionClientAnswer;
}

function setStreamVideoElement(stream) {
  if (!stream) return;

  streamVideoElement.srcObject = stream;
  streamVideoElement.loop = false;
  streamVideoElement.muted = false;
  
  // 크기 강제 설정
  streamVideoElement.style.width = '400px';
  streamVideoElement.style.height = '400px';
  streamVideoElement.style.objectFit = 'contain';

  if (streamVideoElement.paused) {
    streamVideoElement
      .play()
      .then((_) => { })
      .catch((e) => { });
  }
}

function playIdleVideo() {
  // 생성한 idle 비디오 사용
  idleVideoElement.src = 'my_avatar_idle.mp4';
  idleVideoElement.style.display = 'block';
  
  // 크기 강제 설정
  idleVideoElement.style.width = '400px';
  idleVideoElement.style.height = '400px';
  idleVideoElement.style.objectFit = 'contain';
  
  // transform 초기화 (scale 제거)
  idleVideoElement.style.transform = 'translate(-50%, -50%)';
}

function stopAllStreams() {
  if (streamVideoElement.srcObject) {
    console.log('stopping video streams');
    streamVideoElement.srcObject.getTracks().forEach((track) => track.stop());
    streamVideoElement.srcObject = null;
    streamVideoOpacity = 0;
  }
}

function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  pc.removeEventListener('onmessage', onStreamEvent, true);

  clearInterval(statsIntervalId);
  isStreamReady = !stream_warmup;
  streamVideoOpacity = 0;
  if (iceGatheringStatusLabel) iceGatheringStatusLabel.innerText = '';
  if (signalingStatusLabel) signalingStatusLabel.innerText = '';
  if (iceStatusLabel) iceStatusLabel.innerText = '';
  if (peerStatusLabel) peerStatusLabel.innerText = '';
  if (streamEventLabel) streamEventLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

const maxRetryCount = 3;
const maxDelaySec = 4;

async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}

// 페이지 로드 시 자동 연결 및 음성 인식 시작
(async function autoStart() {
    console.log('🚀 자동 연결 시작...');
    
    await new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await connectToStream();
    
    let attempts = 0;
    const waitForConnection = setInterval(() => {
        if (peerConnection?.connectionState === 'connected' && isStreamReady) {
            clearInterval(waitForConnection);
            console.log('✅ 연결 완료! 음성 인식 시작...');
            
            // 연결 완료 메시지
            if (connectionStatus) {
                connectionStatus.textContent = '✅ 연결 완료! 말씀해주세요.';
                connectionStatus.style.color = 'green';
            }
            
            setTimeout(() => {
                recognition.start();
                isRecognizing = true;
                console.log('🎤 음성 인식 활성화');
                
                // 연결 상태 메시지 숨기기
                setTimeout(() => {
                    if (connectionStatus) connectionStatus.style.display = 'none';
                }, 2000);
            }, 1000);
        } else if (attempts++ > 20) {
            clearInterval(waitForConnection);
            console.log('⚠️ 연결 실패');
            if (connectionStatus) {
                connectionStatus.textContent = '❌ 연결 실패. 페이지를 새로고침하세요.';
                connectionStatus.style.color = 'red';
            }
        }
    }, 500);
})();