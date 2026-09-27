document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const floorFilter = document.getElementById('floorFilter');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const roomCards = document.querySelectorAll('.room-card');
  const btnMarkRead = document.getElementById('btnMarkRead');
  const notifItems = document.querySelectorAll('.notif-item');
  const btnNewReservation = document.getElementById('btnNewReservation');
  const reserveBtns = document.querySelectorAll('.btn-reserve');

  let activeStatusFilter = 'all';

  // 1. Search and Filter Functionality
  function filterRooms() {
    const query = searchInput.value.toLowerCase().trim();
    const selectedFloor = floorFilter.value;

    roomCards.forEach(card => {
      const roomName = card.getAttribute('data-name');
      const roomStatus = card.getAttribute('data-status');
      const roomFloor = card.getAttribute('data-floor');

      const matchesSearch = roomName.includes(query);
      const matchesStatus = (activeStatusFilter === 'all' || roomStatus === activeStatusFilter);
      const matchesFloor = (selectedFloor === 'all' || roomFloor === selectedFloor);

      if (matchesSearch && matchesStatus && matchesFloor) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  }

  // Search Input Event
  if (searchInput) {
    searchInput.addEventListener('input', filterRooms);
  }

  // Floor Select Event
  if (floorFilter) {
    floorFilter.addEventListener('change', filterRooms);
  }

  // Status Filter Buttons Event
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatusFilter = btn.getAttribute('data-status');
      filterRooms();
    });
  });

  // 2. Mark All Notifications as Read
  if (btnMarkRead) {
    btnMarkRead.addEventListener('click', () => {
      notifItems.forEach(item => {
        item.classList.add('read');
      });
      alert('All notifications marked as read.');
    });
  }

  // 3. New Reservation Button Click
  if (btnNewReservation) {
    btnNewReservation.addEventListener('click', () => {
      alert('Opening New Reservation Form...');
    });
  }

  // 4. Reserve Specific Room Click
  reserveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const roomName = btn.getAttribute('data-room');
      alert(`Initiating reservation request for ${roomName}...`);
    });
  });
});