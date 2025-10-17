let familyData = [];

document.addEventListener("DOMContentLoaded", () => {
  fetch("data/family.csv")
    .then((resp) => resp.text())
    .then((csvText) => {
      familyData = parseCSV(csvText);
      renderTree(familyData);
    })
    .catch((err) => console.error("Error loading family data:", err));
});

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCSVLine(line);
    const person = {};
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      const key = header.trim();
      
      // Handle different data types
      switch(key) {
        case 'id':
        case 'firstName':
        case 'lastName':
        case 'dob':
        case 'dod':
        case 'sex':
        case 'picture':
        case 'notes':
          person[key] = value || null;
          break;
        case 'married':
          person[key] = value.toLowerCase() === 'true';
          break;
        case 'spouse':
          person[key] = value || null;
          break;
        case 'children':
        case 'parents':
          // Parse pipe-separated values into array
          person[key] = value ? value.split('|').map(v => v.trim()).filter(v => v) : [];
          break;
        default:
          person[key] = value;
      }
    });
    
    data.push(person);
  }
  
  return data;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

function renderTree(data) {
  const width = document.getElementById("tree-container").clientWidth;
  const height = document.getElementById("tree-container").clientHeight;

  const svg = d3
    .select("#tree-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g");

  svg.call(
      d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
  );

  const idToNode = Object.fromEntries(data.map((d) => [d.id, d]));
  
  // Layout configuration
  const LEVEL_HEIGHT = 400; // Vertical spacing between generations
  const PERSON_WIDTH = 180; // Width allocated per person
  const COUPLE_SPACING = 185; // Horizontal spacing between spouses (center to center) - creates 15px gap
  const SIBLING_SPACING = 100; // Extra space between siblings
  const FAMILY_UNIT_SPACING = 300; // Extra space between different root family units
  const CARD_WIDTH = 170; // Width of person card
  const CARD_HEIGHT = 250; // Height of person card
  const PHOTO_HEIGHT = 160; // Height of photo area
  const CHILD_CONNECTOR_HEIGHT = 30; // Height of the vertical connector above children from horizontal line
  
  // Helper: Get generation level (0 = oldest generation)
  function getGenerationLevel(person, memo = {}) {
    if (memo[person.id] !== undefined) return memo[person.id];
    
    // If person has parents, calculate based on parents
    if (person.parents && person.parents.length > 0) {
      const parentLevels = person.parents.map(pid => {
        const parent = idToNode[pid];
        return parent ? getGenerationLevel(parent, memo) : -1;
      });
      memo[person.id] = Math.max(...parentLevels) + 1;
      return memo[person.id];
    }
    
    // If no parents but has a spouse, use spouse's generation
    if (person.spouse) {
      const spouse = idToNode[person.spouse];
      if (spouse && spouse.parents && spouse.parents.length > 0) {
        memo[person.id] = getGenerationLevel(spouse, memo);
        return memo[person.id];
      }
    }
    
    // Default to generation 0 (root)
    memo[person.id] = 0;
    return 0;
  }
  
  // Organize people by generation
  const generations = {};
  data.forEach(person => {
    const level = getGenerationLevel(person);
    if (!generations[level]) generations[level] = [];
    generations[level].push(person);
  });
  
  // Identify couples at each level (male first, then female)
  const couplesByLevel = {};
  const personToCouple = {}; // Map person ID to their couple object
  
  Object.keys(generations).forEach(level => {
    couplesByLevel[level] = [];
    const processed = new Set();
    
    generations[level].forEach(person => {
      if (person.spouse && !processed.has(person.id)) {
        const spouse = idToNode[person.spouse];
        if (spouse && getGenerationLevel(spouse) === parseInt(level)) {
          // Ensure male is person1, female is person2
          const couple = { 
            person1: person.sex === "M" ? person : spouse,
            person2: person.sex === "M" ? spouse : person,
            id: `couple-${person.id}-${spouse.id}`
          };
          couplesByLevel[level].push(couple);
          personToCouple[person.id] = couple;
          personToCouple[spouse.id] = couple;
          processed.add(person.id);
          processed.add(spouse.id);
        }
      }
    });
  });
  
  // Get sorted children for a person
  function getSortedChildren(person) {
    const children = person.children || [];
    return [...children].sort((a, b) => {
      const personA = idToNode[a];
      const personB = idToNode[b];
      if (!personA || !personB) return 0;
      if (!personA.dob || !personB.dob) return 0;
      return personA.dob.localeCompare(personB.dob);
    });
  }
  
  // Calculate width needed for a family unit (person + descendants)
  const widthCache = new Map();
  
  function calculateFamilyWidth(person) {
    if (!person) return PERSON_WIDTH;
    
    // Check cache
    const cacheKey = person.id;
    if (widthCache.has(cacheKey)) {
      return widthCache.get(cacheKey);
    }
    
    // Get children
    const childrenIds = getSortedChildren(person);
    
    if (childrenIds.length === 0) {
      // No children - just need space for this person
      widthCache.set(cacheKey, PERSON_WIDTH);
      return PERSON_WIDTH;
    }
    
    // Calculate total width needed for all children and their descendants
    let totalChildrenWidth = 0;
    
    childrenIds.forEach((childId, idx) => {
      const child = idToNode[childId];
      if (!child) return;
      
      if (idx > 0) {
        totalChildrenWidth += SIBLING_SPACING;
      }
      
      totalChildrenWidth += calculateFamilyWidth(child);
    });
    
    // Width is the maximum of person width and total children width
    const finalWidth = Math.max(PERSON_WIDTH, totalChildrenWidth);
    
    widthCache.set(cacheKey, finalWidth);
    return finalWidth;
  }
  
  // Store all positioned nodes and links
  const nodes = [];
  const links = [];
  const nodePositions = {};
  const positionedPeople = new Set();
  
  // Track couples that need their children positioned later
  const couplesToPositionChildren = [];
  
  // Position a person and their descendants recursively
  function positionFamily(person, level, centerX, yPos, skipChildren = false) {
    if (!person || positionedPeople.has(person.id)) {
      return;
    }
    
    // Position this person
    nodePositions[person.id] = { x: centerX, y: yPos };
    positionedPeople.add(person.id);
    
    nodes.push({
      data: person,
      x: centerX,
      y: yPos,
      level: level
    });
    
    // Position children (unless we're deferring couple children)
    if (!skipChildren) {
      const couple = personToCouple[person.id];
      if (couple && couple.person1.id === person.id) {
        // This person is in a couple - defer child positioning
        couplesToPositionChildren.push({ person, level, yPos });
      } else if (!couple || couple.person2.id === person.id) {
        // Single person or person2 in couple - position children now
        if (!couple) {
          positionChildren(person, level, centerX, yPos);
        }
      }
    }
  }
  
  // Position children of a person (parentCenterX should already be the midpoint for couples)
  function positionChildren(person, parentLevel, parentCenterX, parentY) {
    const childrenIds = getSortedChildren(person);
    if (childrenIds.length === 0) return;
    
    const childLevel = parentLevel + 1;
    const childY = parentY + LEVEL_HEIGHT;
    
    // Calculate widths for each child
    const childWidths = [];
    const childrenToPosition = [];
    
    childrenIds.forEach(childId => {
      const child = idToNode[childId];
      if (!child) return;
      
      childrenToPosition.push(child);
      childWidths.push(calculateFamilyWidth(child));
    });
    
    // Calculate total width needed
    let totalWidth = 0;
    childWidths.forEach((w, idx) => {
      if (idx > 0) totalWidth += SIBLING_SPACING;
      totalWidth += w;
    });
    
    // Start X position (centered under parent or between parents)
    let currentX = parentCenterX - totalWidth / 2;
    
    // Position each child
    childrenToPosition.forEach((child, idx) => {
      const childWidth = childWidths[idx];
      const childCenterX = currentX + childWidth / 2;
      
      positionFamily(child, childLevel, childCenterX, childY);
      
      currentX += childWidth + SIBLING_SPACING;
    });
  }
  
  // Find root level people (generation 0)
  const rootPeople = generations[0] || [];
  const rootY = 150;
  const rootCouples = couplesByLevel[0] || [];
  
  // Calculate widths for root couples (both people + their combined descendants)
  const rootWidths = rootCouples.map(couple => {
    // Children are shared and positioned between both parents
    const childrenIds = getSortedChildren(couple.person1);
    
    if (childrenIds.length === 0) {
      return COUPLE_SPACING + PERSON_WIDTH * 2;
    }
    
    // Calculate total width of all children
    let childrenTotalWidth = 0;
    childrenIds.forEach((childId, idx) => {
      const child = idToNode[childId];
      if (child) {
        if (idx > 0) childrenTotalWidth += SIBLING_SPACING;
        childrenTotalWidth += calculateFamilyWidth(child);
      }
    });
    
    // Width is the maximum of couple spacing and children width
    return Math.max(COUPLE_SPACING + PERSON_WIDTH * 2, childrenTotalWidth);
  });
  
  // Calculate total width
  let totalRootWidth = 0;
  rootWidths.forEach((w, idx) => {
    if (idx > 0) totalRootWidth += FAMILY_UNIT_SPACING;
    totalRootWidth += w;
  });
  
  // Position root couples
  let currentX = Math.max(200, (width - totalRootWidth) / 2);
  
  rootCouples.forEach((couple, idx) => {
    const familyWidth = rootWidths[idx];
    const familyCenterX = currentX + familyWidth / 2;
    
    // Position the couple (male left, female right)
    const person1X = familyCenterX - COUPLE_SPACING / 2;
    const person2X = familyCenterX + COUPLE_SPACING / 2;
    
    // Position person1 (male)
    nodePositions[couple.person1.id] = { x: person1X, y: rootY };
    positionedPeople.add(couple.person1.id);
    nodes.push({
      data: couple.person1,
      x: person1X,
      y: rootY,
      level: 0
    });
    
    // Position person2 (female)
    nodePositions[couple.person2.id] = { x: person2X, y: rootY };
    positionedPeople.add(couple.person2.id);
    nodes.push({
      data: couple.person2,
      x: person2X,
      y: rootY,
      level: 0
    });
    
    // Add heart between couple
    nodes.push({
      isHeart: true,
      x: familyCenterX,
      y: rootY,
      couple: [couple.person1.id, couple.person2.id]
    });
    
    // Position couple's children centered between both parents
    const childrenIds1 = getSortedChildren(couple.person1);
    if (childrenIds1.length > 0) {
      const childLevel = 1;
      const childY = rootY + LEVEL_HEIGHT;
      
      const childWidths = childrenIds1.map(cid => calculateFamilyWidth(idToNode[cid]));
      let totalWidth = 0;
      childWidths.forEach((w, i) => {
        if (i > 0) totalWidth += SIBLING_SPACING;
        totalWidth += w;
      });
      
      // Center children between both parents (not just under person1)
      let childX = familyCenterX - totalWidth / 2;
      childrenIds1.forEach((childId, i) => {
        const child = idToNode[childId];
        if (!child) return;
        
        const childWidth = childWidths[i];
        const childCenterX = childX + childWidth / 2;
        
        // Position child and its descendants
        positionFamily(child, childLevel, childCenterX, childY, false);
        childX += childWidth + SIBLING_SPACING;
      });
    }
    
    currentX += familyWidth + FAMILY_UNIT_SPACING;
  });
  
  // Position any unpositioned people who are in couples (e.g., spouses without parents in tree)
  Object.keys(couplesByLevel).forEach(level => {
    if (parseInt(level) === 0) return; // Skip root level
    
    couplesByLevel[level].forEach(couple => {
      const pos1 = nodePositions[couple.person1.id];
      const pos2 = nodePositions[couple.person2.id];
      
      // If one partner is positioned but the other isn't, position the missing one
      if (pos1 && !pos2) {
        // Position person2 next to person1
        const newX = pos1.x + COUPLE_SPACING;
        nodePositions[couple.person2.id] = { x: newX, y: pos1.y };
        positionedPeople.add(couple.person2.id);
        nodes.push({
          data: couple.person2,
          x: newX,
          y: pos1.y,
          level: parseInt(level)
        });
      } else if (pos2 && !pos1) {
        // Position person1 next to person2
        const newX = pos2.x - COUPLE_SPACING;
        nodePositions[couple.person1.id] = { x: newX, y: pos2.y };
        positionedPeople.add(couple.person1.id);
        nodes.push({
          data: couple.person1,
          x: newX,
          y: pos2.y,
          level: parseInt(level)
        });
      }
    });
  });
  
  // Adjust positions for non-root couples to bring them closer together
  Object.keys(couplesByLevel).forEach(level => {
    if (parseInt(level) === 0) return; // Skip root level
    
    couplesByLevel[level].forEach(couple => {
      const pos1 = nodePositions[couple.person1.id];
      const pos2 = nodePositions[couple.person2.id];
      
      if (!pos1 || !pos2) return;
      
      // Calculate desired positions for tight coupling
      const currentCenterX = (pos1.x + pos2.x) / 2;
      const newPos1X = currentCenterX - COUPLE_SPACING / 2;
      const newPos2X = currentCenterX + COUPLE_SPACING / 2;
      
      // Update positions
      nodePositions[couple.person1.id] = { x: newPos1X, y: pos1.y };
      nodePositions[couple.person2.id] = { x: newPos2X, y: pos2.y };
      
      // Update node positions in the nodes array
      nodes.forEach(node => {
        if (node.data && node.data.id === couple.person1.id) {
          node.x = newPos1X;
        } else if (node.data && node.data.id === couple.person2.id) {
          node.x = newPos2X;
        }
      });
    });
  });
  
  // Now position children for all deferred couples (where both parents are positioned)
  couplesToPositionChildren.forEach(({ person, level, yPos }) => {
    const couple = personToCouple[person.id];
    if (!couple || couple.person1.id !== person.id) return;
    
    const pos1 = nodePositions[couple.person1.id];
    const pos2 = nodePositions[couple.person2.id];
    
    if (!pos1 || !pos2) return; // Both parents must be positioned
    
    const centerX = (pos1.x + pos2.x) / 2;
    positionChildren(person, level, centerX, yPos);
  });
  
  // Add hearts between non-root couples
  Object.keys(couplesByLevel).forEach(level => {
    if (parseInt(level) === 0) return; // Skip root level (already added)
    
    couplesByLevel[level].forEach(couple => {
      const pos1 = nodePositions[couple.person1.id];
      const pos2 = nodePositions[couple.person2.id];
      
      if (pos1 && pos2) {
        // Add heart between them
        const heartX = (pos1.x + pos2.x) / 2;
        const heartY = (pos1.y + pos2.y) / 2;
        
        nodes.push({
          isHeart: true,
          x: heartX,
          y: heartY,
          couple: [couple.person1.id, couple.person2.id]
        });
      }
    });
  });
  
  // Create links between parents and children
  const processedCoupleLinks = new Set();
  
  function createLinks(person, parentLevel) {
    if (!person || !nodePositions[person.id]) return;
    
    const couple = personToCouple[person.id];
    const childrenIds = getSortedChildren(person);
    
    if (childrenIds.length === 0) return;
    
    // Get positioned children
    const positionedChildren = childrenIds
      .map(cid => nodePositions[cid])
      .filter(pos => pos !== undefined);
    
    if (positionedChildren.length === 0) return;
    
    const parentPos = nodePositions[person.id];
    const parentY = parentPos.y;
    const childY = parentY + LEVEL_HEIGHT;
    const midY = parentY + LEVEL_HEIGHT / 2;
    const parentBottomY = parentY + CARD_HEIGHT / 2;
    const childTopY = childY - CARD_HEIGHT / 2;
    
    if (couple) {
      // Person is in a couple - check if we should draw couple links
      const coupleKey = couple.id;
      const pos1 = nodePositions[couple.person1.id];
      const pos2 = nodePositions[couple.person2.id];
      
      if (pos1 && pos2 && couple.person1.id === person.id && !processedCoupleLinks.has(coupleKey)) {
        // Draw T-shaped connection from both parents to children
        processedCoupleLinks.add(coupleKey);
        
        // Vertical lines from each parent down to midpoint
        links.push({ x1: pos1.x, y1: pos1.y + CARD_HEIGHT / 2, x2: pos1.x, y2: midY });
        links.push({ x1: pos2.x, y1: pos2.y + CARD_HEIGHT / 2, x2: pos2.x, y2: midY });
        
        // Horizontal line between parents at midpoint
        links.push({ x1: pos1.x, y1: midY, x2: pos2.x, y2: midY });
        
        // Vertical line from center down to children level
        const centerX = (pos1.x + pos2.x) / 2;
        const horizontalLineY = childTopY - CHILD_CONNECTOR_HEIGHT;
        links.push({ x1: centerX, y1: midY, x2: centerX, y2: horizontalLineY });
        
        // Horizontal line across children
        const leftX = Math.min(...positionedChildren.map(p => p.x));
        const rightX = Math.max(...positionedChildren.map(p => p.x));
        links.push({ x1: leftX, y1: horizontalLineY, x2: rightX, y2: horizontalLineY });
        
        // Vertical connector stubs from horizontal line to each child
        positionedChildren.forEach(childPos => {
          // Small vertical stub from horizontal line
          links.push({ x1: childPos.x, y1: horizontalLineY, x2: childPos.x, y2: childTopY });
          // Line from stub to child card
          links.push({ x1: childPos.x, y1: childTopY, x2: childPos.x, y2: childPos.y - CARD_HEIGHT / 2 });
        });
      } else if (couple.person2.id === person.id || processedCoupleLinks.has(coupleKey)) {
        // Person2 in couple or already processed - skip
        return;
      } else if (!pos2) {
        // Spouse not positioned - treat as single parent
        drawSingleParentLinks(parentPos, positionedChildren, childTopY);
      }
    } else {
      // Single parent with children
      drawSingleParentLinks(parentPos, positionedChildren, childTopY);
    }
    
    // Recursively create links for children
    childrenIds.forEach(childId => {
      const child = idToNode[childId];
      if (child && nodePositions[childId]) {
        createLinks(child, parentLevel + 1);
      }
    });
  }
  
  function drawSingleParentLinks(parentPos, positionedChildren, childTopY) {
    const parentBottomY = parentPos.y + CARD_HEIGHT / 2;
    const horizontalLineY = childTopY - CHILD_CONNECTOR_HEIGHT;
    
    // Vertical line from parent down to horizontal line level
    links.push({ x1: parentPos.x, y1: parentBottomY, x2: parentPos.x, y2: horizontalLineY });
    
    // Horizontal line across all children
    const leftX = Math.min(...positionedChildren.map(p => p.x));
    const rightX = Math.max(...positionedChildren.map(p => p.x));
    links.push({ x1: leftX, y1: horizontalLineY, x2: rightX, y2: horizontalLineY });
    
    // Vertical connector stubs from horizontal line to each child
    positionedChildren.forEach(childPos => {
      // Small vertical stub from horizontal line
      links.push({ x1: childPos.x, y1: horizontalLineY, x2: childPos.x, y2: childTopY });
      // Line from stub to child card
      links.push({ x1: childPos.x, y1: childTopY, x2: childPos.x, y2: childPos.y - CARD_HEIGHT / 2 });
    });
  }
  
  // Create all links starting from root couples
  rootCouples.forEach(couple => {
    createLinks(couple.person1, 0);
  });
  
  // Draw links first (so they appear behind nodes)
  const linksGroup = g.append("g").attr("class", "links-group");
  
  linksGroup.selectAll(".link")
    .data(links)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("x1", d => d.x1)
    .attr("y1", d => d.y1)
    .attr("x2", d => d.x2)
    .attr("y2", d => d.y2)
    .attr("stroke", "#333")
    .attr("stroke-width", "3")
    .attr("stroke-linecap", "round");
  
  // Draw nodes
  const nodesGroup = g.append("g").attr("class", "nodes-group");
  
  const nodeGroups = nodesGroup.selectAll(".node")
    .data(nodes.filter(n => !n.isHeart))
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);
  
  // Draw card background
  nodeGroups
    .append("rect")
    .attr("class", "person-card")
    .attr("width", CARD_WIDTH)
    .attr("height", CARD_HEIGHT)
    .attr("x", -CARD_WIDTH / 2)
    .attr("y", -CARD_HEIGHT / 2)
    .attr("rx", 8)
    .attr("ry", 8)
    .style("fill", d => d.data.sex === "M" ? "#dce8f5" : "#fce4ec")
    .style("stroke", d => d.data.sex === "M" ? "#90a4ae" : "#f48fb1")
    .style("stroke-width", "2px")
    .style("cursor", "pointer")
    .on("click", (event, d) => showMemberModal(d.data));
  
  // Clip path for photo area
  nodeGroups
    .append("defs")
    .append("clipPath")
    .attr("id", d => `clip-${d.data.id}`)
    .append("rect")
    .attr("width", CARD_WIDTH)
    .attr("height", PHOTO_HEIGHT)
    .attr("x", -CARD_WIDTH / 2)
    .attr("y", -CARD_HEIGHT / 2)
    .attr("rx", 8)
    .attr("ry", 8);
  
  // Profile photo
  const imageElements = nodeGroups
    .append("image")
    .attr("width", CARD_WIDTH)
    .attr("height", PHOTO_HEIGHT)
    .attr("x", -CARD_WIDTH / 2)
    .attr("y", -CARD_HEIGHT / 2)
    .attr("clip-path", d => `url(#clip-${d.data.id})`)
    .style("cursor", "pointer")
    .on("click", (event, d) => showMemberModal(d.data));

  // Set image source with fallback to default images
  imageElements.each(function(d) {
    const element = d3.select(this);
    const defaultImage = d.data.sex === "M" ? "images/man.png" : "images/woman.png";
    
    if (d.data.picture) {
      // Try to load the custom picture, fallback to default if it fails
      const img = new Image();
      img.onload = function() {
        element.attr("xlink:href", d.data.picture);
      };
      img.onerror = function() {
        element.attr("xlink:href", defaultImage);
      };
      img.src = d.data.picture;
    } else {
      // No picture specified, use default
      element.attr("xlink:href", defaultImage);
    }
  });
  
  // Name text
  nodeGroups.append("text")
    .attr("y", PHOTO_HEIGHT - CARD_HEIGHT / 2 + 25)
    .attr("text-anchor", "middle")
    .style("pointer-events", "none")
    .style("font-size", "16px")
    .style("font-weight", "700")
    .style("fill", "#333")
    .text(d => d.data.firstName + " " + d.data.lastName);
  
  // Year range text
  nodeGroups.append("text")
    .attr("y", PHOTO_HEIGHT - CARD_HEIGHT / 2 + 48)
    .attr("text-anchor", "middle")
    .style("pointer-events", "none")
    .style("font-size", "15px")
    .style("fill", "#666")
    .text(d => {
      if (d.data.dob) {
        const birthYear = d.data.dob.split("-")[0];
        const deathYear = d.data.dod ? d.data.dod.split("-")[0] : "";
        return deathYear ? birthYear + " - " + deathYear : birthYear + " -";
      }
      return "";
    });
  
  // Draw hearts
  nodesGroup.selectAll(".heart")
    .data(nodes.filter(n => n.isHeart))
    .enter()
    .append("text")
    .attr("class", "heart")
    .attr("x", d => d.x)
    .attr("y", d => d.y + 8)
    .attr("text-anchor", "middle")
    .style("font-size", "32px")
    .text("❤️");
}

function showMemberModal(member) {
  const modal = new bootstrap.Modal(document.getElementById("memberModal"));
  document.getElementById(
    "memberName"
  ).textContent = `${member.firstName} ${member.lastName}`;
  
  // Look up spouse information
  let spouseInfo = "-";
  if (member.spouse) {
    const spouse = familyData.find(p => p.id === member.spouse);
    if (spouse) {
      spouseInfo = `${spouse.firstName} ${spouse.lastName}`;
    }
  }
  
  document.getElementById("memberInfo").innerHTML = `
    <p><strong>Date of Birth:</strong> ${member.dob || "-"} </p>
    <p><strong>Date of Death:</strong> ${member.dod || "-"} </p>
    <p><strong>Sex:</strong> ${member.sex || "-"} </p>
    <p><strong>Married:</strong> ${member.married ? "Yes" : "No"} </p>
    <p><strong>Spouse:</strong> ${spouseInfo} </p>
    ${
      member.picture
        ? `<img src="${member.picture}" alt="${member.firstName}" class="img-fluid rounded mt-2"/>`
        : ""
    }
    <p class="mt-2">${member.notes || ""}</p>
    `;
  modal.show();
}
