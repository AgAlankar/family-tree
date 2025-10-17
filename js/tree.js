let familyData = [];

document.addEventListener("DOMContentLoaded", () => {
  fetch("data/family.json")
    .then((resp) => resp.json())
    .then((data) => {
      familyData = data;
      renderTree(data);
    })
    .catch((err) => console.error("Error loading family data:", err));
});

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
  
  // Custom layout for family tree with couples side by side
  const levelHeight = 200;
  const personSpacing = 180;
  const coupleSpacing = 300;
  
  // Identify couples and individuals
  const couples = [];
  const processed = new Set();
  
  data.forEach(person => {
    if (person.spouse && !processed.has(person.id) && !processed.has(person.spouse)) {
      const spouse = idToNode[person.spouse];
      couples.push({ person1: person, person2: spouse });
      processed.add(person.id);
      processed.add(person.spouse);
    }
  });
  
  // Get all individuals (not in couples) with no parents
  const soloRoots = data.filter(p => 
    p.parents.length === 0 && !processed.has(p.id)
  );
  
  // Build layout manually
  const nodes = [];
  const links = [];
  let yPos = 100;
  
  // Position couples at top level
  let xPos = width / 2 - (couples.length * coupleSpacing) / 2;
  
  couples.forEach((couple, idx) => {
    const coupleX = xPos + idx * coupleSpacing;
    
    // Position the two spouses
    const person1Node = {
      data: couple.person1,
      x: coupleX - personSpacing / 2,
      y: yPos,
      level: 0
    };
    
    const person2Node = {
      data: couple.person2,
      x: coupleX + personSpacing / 2,
      y: yPos,
      level: 0
    };
    
    nodes.push(person1Node, person2Node);
    
    // Add heart between them
    nodes.push({
      isHeart: true,
      x: coupleX,
      y: yPos,
      couple: [couple.person1.id, couple.person2.id]
    });
    
    // Position children
    const children = couple.person1.children || [];
    if (children.length > 0) {
      const childY = yPos + levelHeight;
      const childStartX = coupleX - (children.length - 1) * personSpacing / 2;
      
      // Add T-shaped connection
      const midY = yPos + levelHeight / 2;
      
      // Horizontal line between parents at mid level
      links.push({
        type: "couple-to-mid",
        x1: person1Node.x,
        y1: person1Node.y,
        x2: coupleX,
        y2: midY
      });
      
      links.push({
        type: "couple-to-mid",
        x1: person2Node.x,
        y1: person2Node.y,
        x2: coupleX,
        y2: midY
      });
      
      // Vertical line down from mid point
      links.push({
        type: "mid-to-children",
        x1: coupleX,
        y1: midY,
        x2: coupleX,
        y2: childY - 30
      });
      
      children.forEach((childId, cIdx) => {
        const child = idToNode[childId];
        const childX = childStartX + cIdx * personSpacing;
        
        nodes.push({
          data: child,
          x: childX,
          y: childY,
          level: 1
        });
        
        // Line from children's horizontal connector to each child
        if (children.length > 1) {
          links.push({
            type: "horizontal-child",
            x1: childX,
            y1: childY - 30,
            x2: childX,
            y2: childY - 30
          });
        }
        
        links.push({
          type: "child",
          x1: childX,
          y1: childY - 30,
          x2: childX,
          y2: childY
        });
      });
      
      // Horizontal connector for multiple children
      if (children.length > 1) {
        const leftChildX = childStartX;
        const rightChildX = childStartX + (children.length - 1) * personSpacing;
        links.push({
          type: "horizontal-connector",
          x1: leftChildX,
          y1: childY - 30,
          x2: rightChildX,
          y2: childY - 30
        });
      }
    }
  });
  
  // Draw links
  g.selectAll(".link")
    .data(links)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("x1", d => d.x1)
    .attr("y1", d => d.y1)
    .attr("x2", d => d.x2)
    .attr("y2", d => d.y2);
  
  // Draw nodes
  const nodeGroups = g.selectAll(".node")
    .data(nodes.filter(n => !n.isHeart))
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);
  
  nodeGroups
    .append("circle")
    .attr("r", 50)
    .on("click", (event, d) => showMemberModal(d.data));
  
  nodeGroups
    .append("text")
    .attr("dy", 72)
    .attr("text-anchor", "middle")
    .style("pointer-events", "none")
    .style("font-size", "18px")
    .style("font-weight", "600")
    .style("fill", "#333")
    .text(d => d.data.firstName);
  
  nodeGroups
    .append("text")
    .attr("dy", 90)
    .attr("text-anchor", "middle")
    .style("pointer-events", "none")
    .style("font-size", "13px")
    .style("fill", "#666")
    .text(d => {
      if (!d.data.dob) return "";
      const birthYear = d.data.dob.split("-")[0];
      const deathYear = d.data.dod ? d.data.dod.split("-")[0] : "Present";
      return birthYear + " - " + deathYear;
    });
  
  // Draw hearts
  g.selectAll(".heart")
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
