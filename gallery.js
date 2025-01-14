const room = new WebsimSocket();
let galleryImages = [];
let currentTab = 'recent';
let currentEditId = null;
let currentSearch = '';
let imageCounter = 0;
let currentImage = null;
let currentPage = 1;
const itemsPerPage = 10;

// Add rate limiting variables
let lastDbOperation = 0;
const MIN_DB_OPERATION_INTERVAL = 1000; // 1 second in milliseconds

// Helper function to check if enough time has passed since last DB operation
function canPerformDbOperation() {
  const now = Date.now();
  if (now - lastDbOperation < MIN_DB_OPERATION_INTERVAL) {
    return false;
  }
  lastDbOperation = now;
  return true;
}

// Wrap database operations with rate limiting
async function safeDbOperation(operation) {
  if (!canPerformDbOperation()) {
    throw new Error('Please wait a moment before performing another operation');
  }
  return operation();
}

async function initGallery() {
  try {
    const [images, unsubscribe] = await Promise.all([
      room.collection('gallery_images').getList(),
      room.collection('gallery_images').subscribe(newImages => {
        galleryImages = newImages;
        renderGallery();
      })
    ]);
    
    galleryImages = images;
    renderGallery();
    return unsubscribe;
  } catch (error) {
    console.error('Error initializing gallery:', error);
    throw error;
  }
}

function renderGallery() {
  const galleryEl = document.getElementById('gallery');
  let images = [...galleryImages];
  
  if (currentSearch) {
    const searchLower = currentSearch.toLowerCase();
    images = images.filter(img => 
      img.prompt.toLowerCase().includes(searchLower) || 
      img.username.toLowerCase().includes(searchLower)
    );
  }

  switch (currentTab) {
    case 'popular':
      images.sort((a, b) => (b.views || 0) - (a.views || 0));
      break;
    case 'my':
      images = images.filter(img => img.username === room.party.client.username);
      break;
    default:
      images.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Calculate pagination
  const totalPages = Math.ceil(images.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageImages = images.slice(startIndex, endIndex);

  // Update pagination controls
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById('prevPage').disabled = currentPage === 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;

  if (pageImages.length === 0) {
    galleryEl.innerHTML = `
      <div class="no-results">
        ${currentSearch ? 'No images found matching your search' : 'No images available'}
      </div>
    `;
    return;
  }

  galleryEl.innerHTML = pageImages.map(img => `
    <div class="gallery-item">
      <img src="${img.imageUrl}" alt="${img.prompt}" onclick="loadGalleryImage('${img.id}')">
      <div class="metadata">
        <div>${img.prompt}</div>
        <div>by ${img.username}</div>
        <div>${new Date(img.created_at).toLocaleDateString()}</div>
      </div>
      <div class="stats">
        <span>${img.views || 0} views</span>
        <span>${img.uses || 0} uses</span>
      </div>
      ${img.username === room.party.client.username ? `
        <div class="gallery-item-controls">
          <button class="edit-button" onclick="editImage('${img.id}')">Edit</button>
          <button class="delete-button" onclick="deleteImage('${img.id}')">Delete</button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function showGalleryTab(tab) {
  currentTab = tab;
  currentPage = 1; // Reset to first page when changing tabs
  document.querySelectorAll('.gallery-tab').forEach(el => {
    el.classList.toggle('active', el.textContent.toLowerCase().includes(tab));
  });
  renderGallery();
}

async function loadGalleryImage(id) {
  try {
    const image = galleryImages.find(img => img.id === id);
    if (!image) return;

    await room.collection('gallery_images').update(id, {
      views: (image.views || 0) + 1,
      uses: (image.uses || 0) + 1
    });

    const imageContainer = document.getElementById('imageContainer');
    const existingImages = imageContainer.querySelectorAll('img');
    existingImages.forEach(img => img.remove());

    const generatedImage = document.createElement('img');
    generatedImage.id = `generatedImage_${Date.now()}`;
    generatedImage.className = 'generated-image';
    generatedImage.style.display = 'none';
    generatedImage.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      generatedImage.onload = resolve;
      generatedImage.onerror = reject;
      generatedImage.src = image.imageUrl;
      generatedImage.alt = image.prompt;
    });

    imageContainer.appendChild(generatedImage);
    currentImage = generatedImage;
    
    document.getElementById('saveButton').style.display = 'block';
    document.getElementById('addGalleryButton').style.display = 'block';

    setupImageEditor();
  } catch (error) {
    console.error('Error loading gallery image:', error);
    throw error;
  }
}

function editImage(id) {
  const image = galleryImages.find(img => img.id === id);
  if (!image) return;
  currentEditId = id;
  const dialog = document.getElementById('editPromptDialog');
  const overlay = document.getElementById('overlay');
  const input = document.getElementById('editPromptInput');
  input.value = image.prompt;
  dialog.style.display = 'block';
  overlay.style.display = 'block';
}

async function saveEdit() {
  if (!currentEditId) return;
  
  const input = document.getElementById('editPromptInput');
  const newPrompt = input.value.trim();
  
  if (!newPrompt) {
    alert('Please enter a prompt');
    return;
  }
  
  try {
    await safeDbOperation(async () => {
      await room.collection('gallery_images').update(currentEditId, {
        prompt: newPrompt
      });
    });
    cancelEdit();
  } catch (error) {
    alert(error.message || 'Failed to save edit. Please try again.');
  }
}

function cancelEdit() {
  currentEditId = null;
  const dialog = document.getElementById('editPromptDialog');
  const overlay = document.getElementById('overlay');
  const input = document.getElementById('editPromptInput');
  input.value = '';
  dialog.style.display = 'none';
  overlay.style.display = 'none';
}

async function deleteImage(id) {
  if (!confirm('Are you sure you want to delete this image?')) return;
  
  try {
    await safeDbOperation(async () => {
      await room.collection('gallery_images').delete(id);
    });
  } catch (error) {
    alert(error.message || 'Failed to delete image. Please try again.');
  }
}

function filterGallery() {
  const searchInput = document.getElementById('gallerySearch');
  currentSearch = searchInput.value.trim();
  currentPage = 1; // Reset to first page when filtering
  renderGallery();
}

function changePage(delta) {
  const newPage = currentPage + delta;
  const totalPages = Math.ceil(galleryImages.length / itemsPerPage);
  
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderGallery();
  }
}

async function addToGallery() {
  try {
    const canvas = document.getElementById('editCanvas');
    const promptInput = document.getElementById('promptInput');
    const prefixSelect = document.getElementById('prefixPrompt');
    const suffixSelect = document.getElementById('suffixPrompt');
    const fullPrompt = `${prefixSelect.value}${promptInput.value.trim()}${suffixSelect.value}`;
    
    await safeDbOperation(async () => {
      const sourceImage = galleryImages.find(img => 
        img.imageUrl === currentImage.src
      );
      
      if (sourceImage) {
        await room.collection('gallery_images').update(sourceImage.id, {
          uses: (sourceImage.uses || 0) + 1,
          views: (sourceImage.views || 0) + 1
        });
      }
      
      const promptHistory = sourceImage ? 
        [...(sourceImage.promptHistory || [{
          prompt: sourceImage.prompt,
          timestamp: sourceImage.created_at,
          username: sourceImage.username
        }])] : [];
      
      promptHistory.push({
        prompt: fullPrompt,
        timestamp: new Date().toISOString(),
        username: room.party.client.username
      });
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'edited-image.png', { type: 'image/png' });
      const imageUrl = await websim.upload(file);
      
      await room.collection('gallery_images').create({
        prompt: fullPrompt,
        title: fullPrompt,
        imageUrl: imageUrl,
        views: 0,
        uses: 0,
        modified: true,
        promptHistory: promptHistory,
        sourceImageId: sourceImage?.id
      });
    });

    alert('Image added to gallery successfully!');
  } catch (error) {
    console.error('Error adding to gallery:', error);
    alert(error.message || 'Failed to add image to gallery. Please try again.');
  }
}

async function generateImage() {
  const prefixSelect = document.getElementById('prefixPrompt');
  const promptInput = document.getElementById('promptInput');
  const suffixSelect = document.getElementById('suffixPrompt');
  const fullPrompt = `${prefixSelect.value}${promptInput.value.trim()}${suffixSelect.value}`;

  if (!promptInput.value.trim()) {
    alert('Please enter a prompt!');
    return;
  }

  try {
    const [imageContainer, loadingSpinner, placeholderText, saveButton, addGalleryButton] = 
      ['imageContainer', 'loadingSpinner', 'placeholderText', 'saveButton', 'addGalleryButton']
      .map(id => document.getElementById(id));

    loadingSpinner.style.display = 'block';
    placeholderText.style.display = 'none';
    saveButton.style.display = 'none';
    addGalleryButton.style.display = 'none';

    const existingImages = imageContainer.querySelectorAll('img');
    existingImages.forEach(img => img.remove());

    const generatedImage = document.createElement('img');
    generatedImage.id = `generatedImage_${Date.now()}`;
    generatedImage.className = 'generated-image';
    generatedImage.style.display = 'none';
    generatedImage.crossOrigin = 'anonymous';

    // Wait for image to load
    await new Promise((resolve, reject) => {
      generatedImage.onload = resolve;
      generatedImage.onerror = reject;
      generatedImage.src = fullPrompt;
      generatedImage.alt = fullPrompt;
    });

    loadingSpinner.style.display = 'none';
    generatedImage.style.display = 'block';
    placeholderText.style.display = 'none';  
    saveButton.style.display = 'block';
    addGalleryButton.style.display = 'block';
    currentImage = generatedImage;

    // Add to gallery
    try {
      await safeDbOperation(async () => {
        await room.collection('gallery_images').create({
          prompt: fullPrompt,
          imageUrl: generatedImage.src,
          views: 0,
          uses: 0,
          promptHistory: [{
            prompt: fullPrompt,
            timestamp: new Date().toISOString(),
            username: room.party.client.username
          }]
        });
      });
    } catch (error) {
      console.error('Error generating image:', error);
      alert(error.message || 'Failed to generate image. Please try again.');
      throw error;
    }

    imageContainer.appendChild(generatedImage);
    setupImageEditor();

  } catch (error) {
    console.error('Error generating image:', error);
    alert('Failed to generate image. Please try again.');
    throw error;
  }
}

async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const imageUrl = await websim.upload(file);
    
    const uploadedImage = new Image();
    await new Promise((resolve, reject) => {
      uploadedImage.onload = resolve;
      uploadedImage.onerror = reject;
      uploadedImage.src = URL.createObjectURL(file);
    });

    currentImage = uploadedImage;
    setupImageEditor();

    try {
      await safeDbOperation(async () => {
        await room.collection('gallery_images').create({
          imageUrl: imageUrl,
          prompt: file.name,
          views: 0,
          uses: 0,
          modified: false
        });
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert(error.message || 'Failed to upload image. Please try again.');
    }
    
  } catch (error) {
    console.error('Error uploading image:', error);
    alert('Failed to upload image. Please try again.');
    throw error;
  }
}