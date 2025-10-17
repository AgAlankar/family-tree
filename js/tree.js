document.addEventListener("DOMContentLoaded", () => {
  fetch("data/family.json")
    .then((resp) => resp.json())
    .then((data) => renderTree(data))
    .catch((err) => console.error("Error loading family data:", err));
});

function renderTree(data) {
  const width = document.getElementById("tree-container").clientWidth;
  const height = document.getElementById("tree-container").clientHeight;

  const svg = d3
    .select("#tree-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .call(
      d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
      })
    )
    .append("g");

  const idToNode = Object.fromEntries(data.map((d) => [d.id, d]));
  const rootPerson = data.find((p) => p.parents.length === 0);

  const buildHierarchy = (person) => {
    return {
      name: person.firstName + " " + person.lastName,
      data: person,
      children: (person.children || []).map((cid) =>
        buildHierarchy(idToNode[cid])
      ),
    };
  };

  const root = d3.hierarchy(buildHierarchy(rootPerson));
  const treeLayout = d3.tree().size([width - 200, height - 200]);
  treeLayout(root);

  svg
    .selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr(
      "d",
      d3
        .linkVertical()
        .x((d) => d.x + 100)
        .y((d) => d.y + 50)
    );

  const nodes = svg
    .selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("class", "node")
    .attr("transform", (d) => `translate(${d.x + 100},${d.y + 50})`);

  nodes
    .append("circle")
    .attr("r", 20)
    .on("click", (event, d) => showMemberModal(d.data.data));

  nodes
    .append("text")
    .attr("dy", 35)
    .text((d) => d.data.name);
}

function showMemberModal(member) {
  const modal = new bootstrap.Modal(document.getElementById("memberModal"));
  document.getElementById(
    "memberName"
  ).textContent = `${member.firstName} ${member.lastName}`;
  document.getElementById("memberInfo").innerHTML = `
    <p><strong>Date of Birth:</strong> ${member.dob || "-"} </p>
    <p><strong>Date of Death:</strong> ${member.dod || "-"} </p>
    <p><strong>Sex:</strong> ${member.sex || "-"} </p>
    <p><strong>Married:</strong> ${member.married ? "Yes" : "No"} </p>
    ${
      member.picture
        ? `<img src="${member.picture}" alt="${member.firstName}" class="img-fluid rounded mt-2"/>`
        : ""
    }
    <p class="mt-2">${member.notes || ""}</p>
    `;
  modal.show();
}
