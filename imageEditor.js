let imageCounter = 0;
let currentImage = null;
let originalImageData = null;
let currentSelection = null;
let isShiftPressed = false;
let isCtrlPressed = false;
let selectionCanvas = null;
let selectionCtx = null;

function setupImageEditor() {
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  const editorControls = document.getElementById('editorControls');
  const fillImagePrompt = document.getElementById('fillImagePrompt');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const placeholderText = document.getElementById('placeholderText');

  loadingSpinner.style.display = 'none';
  placeholderText.style.display = 'none';

  if (currentImage) {
    canvas.width = currentImage.naturalWidth;
    canvas.height = currentImage.naturalHeight;
    ctx.drawImage(currentImage, 0, 0);
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    currentImage.style.display = 'none';
    canvas.style.display = 'block';
    editorControls.style.display = 'flex';
  } else {
    canvas.style.display = 'none';
    editorControls.style.display = 'flex';
  }

  fillImagePrompt.style.display = 'none';
  
  if (!canvas.hasEventListener) {
    canvas.addEventListener('click', handleCanvasClick);
    canvas.hasEventListener = true;
  }
}

function handleCanvasClick(e) {
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  if (!isShiftPressed && !isCtrlPressed) {
    currentSelection = null;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const newSelection = magicWandSelect(imageData, Math.round(x), Math.round(y), 32);

  if (isShiftPressed || isCtrlPressed) {
    if (currentSelection) {
      for (let i = 0; i < currentSelection.length; i++) {
        currentSelection[i] = currentSelection[i] || newSelection[i];
      }
    } else {
      currentSelection = newSelection;
    }
  } else {
    currentSelection = newSelection;
  }

  drawSelectionOverlay();
}

function magicWandSelect(imageData, startX, startY, tolerance) {
  const width = imageData.width;
  const height = imageData.height;
  const pixels = imageData.data;
  const visited = new Uint8Array(width * height);
  const selected = new Uint8Array(width * height);
  
  const startPos = (startY * width + startX) * 4;
  const startR = pixels[startPos];
  const startG = pixels[startPos + 1];
  const startB = pixels[startPos + 2];
  
  const stack = [[startX, startY]];
  
  while (stack.length) {
    const [x, y] = stack.pop();
    const pos = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height || visited[pos]) {
      continue;
    }
    
    const pixelPos = pos * 4;
    const r = pixels[pixelPos];
    const g = pixels[pixelPos + 1];
    const b = pixels[pixelPos + 2];
    
    const colorDiff = Math.sqrt(
      Math.pow(r - startR, 2) + 
      Math.pow(g - startG, 2) + 
      Math.pow(b - startB, 2)
    );
    
    if (colorDiff <= tolerance) {
      visited[pos] = 1;
      selected[pos] = 1;
      stack.push(
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      );
    }
  }
  
  return selected;
}

function drawSelectionOverlay() {
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  
  ctx.putImageData(originalImageData, 0, 0);
  
  if (!currentSelection) return;
  
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      if (currentSelection[pos]) {
        const isEdge = 
          x > 0 && !currentSelection[pos - 1] || 
          x < width - 1 && !currentSelection[pos + 1] || 
          y > 0 && !currentSelection[pos - width] || 
          y < height - 1 && !currentSelection[pos + width];
          
        if (isEdge) {
          ctx.fillStyle = 'white';
          ctx.fillRect(x - 1, y - 1, 3, 3);
          ctx.strokeStyle = 'black';
          ctx.strokeRect(x - 1, y - 1, 3, 3);
        }
      }
    }
  }
}

function setTool(tool) {
  const canvas = document.getElementById('editCanvas');
  const fillImagePrompt = document.getElementById('fillImagePrompt');
  
  document.querySelectorAll('.tool-button').forEach(btn => 
    btn.classList.remove('active')
  );
  
  const toolButton = document.getElementById(`${tool}Tool`);
  if (toolButton) {
    toolButton.classList.add('active');
  }

  switch (tool) {
    case 'fillSelection':
      if (currentSelection) {
        fillImagePrompt.style.display = 'none';
        fillSelection();
      }
      break;
    case 'setAlpha':
      if (currentSelection) {
        fillImagePrompt.style.display = 'none';
        setSelectionAlpha();
      }
      break;
    case 'fillWithImage':
      if (currentSelection) {
        fillImagePrompt.style.display = 'flex';
      }
      break;
    default:
      fillImagePrompt.style.display = 'none';
  }
  
  canvas.className = tool === 'magicWand' ? 'magic-wand' : '';
}

function fillSelection() {
  if (!currentSelection) return;
  
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  const color = document.getElementById('colorPicker').value;
  const r = parseInt(color.substr(1, 2), 16);
  const g = parseInt(color.substr(3, 2), 16);
  const b = parseInt(color.substr(5, 2), 16);
  
  for (let i = 0; i < currentSelection.length; i++) {
    if (currentSelection[i]) {
      const pixelPos = i * 4;
      pixels[pixelPos] = r;
      pixels[pixelPos + 1] = g;
      pixels[pixelPos + 2] = b;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  originalImageData = imageData;
}

function setSelectionAlpha() {
  if (!currentSelection) return;
  
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  for (let i = 0; i < currentSelection.length; i++) {
    if (currentSelection[i]) {
      const pixelPos = i * 4;
      pixels[pixelPos + 3] = 0;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  originalImageData = imageData;
}

function clearSelection() {
  currentSelection = null;
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  ctx.putImageData(originalImageData, 0, 0);
}

function resetImage() {
  const canvas = document.getElementById('editCanvas');
  const ctx = canvas.getContext('2d');
  ctx.putImageData(originalImageData, 0, 0);
  currentSelection = null;
}

async function generateSelectionFill() {
  if (!currentSelection) return;
  
  const prompt = document.getElementById('selectionPromptInput').value.trim();
  if (!prompt) {
    alert('Please enter a prompt for the selected region');
    return;
  }

  const prefixSelect = document.getElementById('prefixPrompt');
  const suffixSelect = document.getElementById('suffixPrompt');
  const fullPrompt = `${prefixSelect.value}${prompt}${suffixSelect.value}`;

  const loadingSpinner = document.getElementById('loadingSpinner');
  loadingSpinner.style.display = 'block';

  const generatedImage = document.createElement('img');
  const tempId = `fillImage_${Date.now()}`;
  generatedImage.id = tempId;
  generatedImage.crossOrigin = 'anonymous';
  generatedImage.style.display = 'none';
  
  generatedImage.src = fullPrompt;
  generatedImage.alt = fullPrompt;

  const initialSrc = generatedImage.src;

  generatedImage.onload = async function() {
    // Only proceed if this is the final image load event for our intended src
    if (generatedImage.src !== initialSrc) {
      loadingSpinner.style.display = 'none';
      
      const canvas = document.getElementById('editCanvas');
      const ctx = canvas.getContext('2d');

      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const pos = y * canvas.width + x;
          if (currentSelection[pos]) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      const selectionWidth = maxX - minX + 1;
      const selectionHeight = maxY - minY + 1;
      
      tempCanvas.width = selectionWidth;
      tempCanvas.height = selectionHeight;
      
      tempCtx.drawImage(generatedImage, 0, 0, selectionWidth, selectionHeight);
      
      const scaledImageData = tempCtx.getImageData(0, 0, selectionWidth, selectionHeight);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const pos = y * canvas.width + x;
          if (currentSelection[pos]) {
            const scaledX = x - minX;
            const scaledY = y - minY;
            const scaledPos = (scaledY * selectionWidth + scaledX) * 4;
            const targetPos = pos * 4;
            
            pixels[targetPos] = scaledImageData.data[scaledPos];
            pixels[targetPos + 1] = scaledImageData.data[scaledPos + 1];
            pixels[targetPos + 2] = scaledImageData.data[scaledPos + 2];
            pixels[targetPos + 3] = scaledImageData.data[scaledPos + 3];
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      originalImageData = imageData;

      const sourceImage = galleryImages.find(img => 
        img.imageUrl === currentImage.src
      );
      
      if (sourceImage) {
        // Check for recent edit by same user
        const lastEdit = galleryImages
          .filter(img => img.sourceImageId === sourceImage.id)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
        // Get the base prompt history from either current edit or source image
        const basePromptHistory = lastEdit?.username === room.party.client.username ? 
          lastEdit.promptHistory : 
          [{
            prompt: sourceImage.prompt,
            timestamp: sourceImage.created_at,
            username: sourceImage.username
          }];
        
        // Create a fresh copy of the history
        const promptHistory = [...basePromptHistory];
        
        // Add new edit entry
        promptHistory.push({
          prompt: fullPrompt,
          timestamp: new Date().toISOString(),
          type: 'selection-fill',
          username: room.party.client.username
        });

        // Generate new image URL
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'edited-image.png', { type: 'image/png' });
        const imageUrl = await websim.upload(file);

        if (lastEdit?.username === room.party.client.username) {
          // Update existing edit
          await room.collection('gallery_images').update(lastEdit.id, {
            imageUrl: imageUrl,
            promptHistory: promptHistory
          });
        } else {
          // Create new edit entry
          await room.collection('gallery_images').create({
            prompt: fullPrompt,
            title: fullPrompt,
            imageUrl: imageUrl,
            views: 0,
            uses: 0,
            modified: true,
            promptHistory: promptHistory,
            sourceImageId: sourceImage.id
          });

          // Update source image usage count
          await room.collection('gallery_images').update(sourceImage.id, {
            uses: (sourceImage.uses || 0) + 1
          });
        }

        // Update current image reference
        currentImage.src = imageUrl;
      }
      
      document.getElementById('fillImagePrompt').style.display = 'none';
      generatedImage.remove();
    }
  };

  document.body.appendChild(generatedImage);
}