export const workerCode = `
  let targetPos = [0, 50, 600];
  let targetLookAt = [0, 50, 0];
  let currentPos = [0, 50, 600];
  let currentLookAt = [0, 50, 0];

  self.onmessage = function(e) {
    if (e.data.type === 'SET_TARGET') {
      targetPos = e.data.targetPos;
      targetLookAt = e.data.targetLookAt;
    } else if (e.data.type === 'TICK') {
        const dt = Math.min(e.data.delta, 0.1);
        const lerpFactor = 1 - Math.exp(-6 * dt); // Faster, smoother dampening
        
        // Custom Lerp
        currentPos[0] += (targetPos[0] - currentPos[0]) * lerpFactor;
        currentPos[1] += (targetPos[1] - currentPos[1]) * lerpFactor;
        currentPos[2] += (targetPos[2] - currentPos[2]) * lerpFactor;

        currentLookAt[0] += (targetLookAt[0] - currentLookAt[0]) * lerpFactor;
        currentLookAt[1] += (targetLookAt[1] - currentLookAt[1]) * lerpFactor;
        currentLookAt[2] += (targetLookAt[2] - currentLookAt[2]) * lerpFactor;

        self.postMessage({
            type: 'TICK_RESULT',
            currentPos,
            currentLookAt
        });
    }
  }
`;
