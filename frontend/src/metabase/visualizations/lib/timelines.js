import d3 from "d3";
import _ from "underscore";
import { ICON_PATHS } from "metabase/icon_paths";
import { stretchTimeseriesDomain } from "./apply_axis";
import timeseriesScale from "./timeseriesScale";

const ICON_SIZE = 16;
const ICON_SCALE = 0.45;
const ICON_LARGE_SCALE = 0.35;
const ICON_X = -ICON_SIZE;
const ICON_Y = 10;
const ICON_DISTANCE = ICON_SIZE;
const TEXT_X = 10;
const TEXT_Y = 16;
const TEXT_DISTANCE = ICON_SIZE * 1.75;
const RECT_SIZE = ICON_SIZE * 2;

function getXAxis(chart) {
  return chart.svg().select(".axis.x");
}

function getBrush(chart) {
  return chart.svg().select(".brush");
}

function getEventScale(chart, xDomain, xInterval) {
  return timeseriesScale(xInterval)
    .domain(stretchTimeseriesDomain(xDomain, xInterval))
    .range([0, chart.effectiveWidth()]);
}

function getEventMapping(events, xInterval) {
  return _.groupBy(events, event =>
    event.timestamp
      .clone()
      .startOf(xInterval.interval)
      .valueOf(),
  );
}

function getEventDates(eventMapping) {
  return Object.keys(eventMapping).map(value => new Date(parseInt(value)));
}

function getEventGroups(eventMapping) {
  return Object.values(eventMapping);
}

function isSelected(events, selectedEventIds) {
  return events.some(event => selectedEventIds.includes(event.id));
}

function getIcon(events, eventIndex, eventScale, eventDates) {
  if (isEventNarrow(eventIndex, eventScale, eventDates)) {
    return "unknown";
  } else {
    return events.length === 1 ? events[0].icon : "star";
  }
}

function getIconPath(events, eventIndex, eventScale, eventDates) {
  const icon = getIcon(events, eventIndex, eventScale, eventDates);
  return ICON_PATHS[icon].path ? ICON_PATHS[icon].path : ICON_PATHS[icon];
}

function getIconTransform(events, eventIndex, eventScale, eventDates) {
  const icon = getIcon(events, eventIndex, eventScale, eventDates);
  const scale = icon === "mail" ? ICON_LARGE_SCALE : ICON_SCALE;
  return `scale(${scale}) translate(${ICON_X}, ${ICON_Y})`;
}

function isEventWithin(eventIndex, eventScale, eventDates, eventDistance) {
  const thisDate = eventDates[eventIndex];
  const prevDate = eventDates[eventIndex - 1];
  const nextDate = eventDates[eventIndex + 1];
  const prevDistance = prevDate && eventScale(thisDate) - eventScale(prevDate);
  const nextDistance = nextDate && eventScale(nextDate) - eventScale(thisDate);

  return prevDistance < eventDistance || nextDistance < eventDistance;
}

function isEventNarrow(eventIndex, eventScale, eventDates) {
  return isEventWithin(eventIndex, eventScale, eventDates, ICON_DISTANCE);
}

function hasEventText(events, eventIndex, eventScale, eventDates) {
  if (events.length > 1) {
    return !isEventWithin(eventIndex, eventScale, eventDates, TEXT_DISTANCE);
  } else {
    return false;
  }
}

function renderEventLines({
  brush,
  eventScale,
  eventDates,
  eventGroups,
  selectedEventIds,
}) {
  const eventLines = brush.selectAll(".event-line").data(eventGroups);
  const brushHeight = brush.select(".background").attr("height");
  eventLines.exit().remove();

  eventLines
    .enter()
    .append("line")
    .attr("class", "event-line")
    .classed("hover", d => isSelected(d, selectedEventIds))
    .attr("x1", (d, i) => eventScale(eventDates[i]))
    .attr("x2", (d, i) => eventScale(eventDates[i]))
    .attr("y1", "0")
    .attr("y2", brushHeight);
}

function renderEventTicks({
  axis,
  brush,
  eventScale,
  eventDates,
  eventGroups,
  selectedEventIds,
  onHoverChange,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
}) {
  const eventAxis = axis.selectAll(".event-axis").data([eventGroups]);
  const eventLines = brush.selectAll(".event-line").data(eventGroups);
  eventAxis.exit().remove();

  eventAxis
    .enter()
    .append("g")
    .attr("class", "event-axis");

  const eventTicks = eventAxis.selectAll(".event-tick").data(eventGroups);
  eventTicks.exit().remove();

  eventTicks
    .enter()
    .append("g")
    .attr("class", "event-tick")
    .classed("hover", d => isSelected(d, selectedEventIds))
    .attr("transform", (d, i) => `translate(${eventScale(eventDates[i])}, 0)`);

  eventTicks
    .append("path")
    .attr("class", "event-icon")
    .attr("d", (d, i) => getIconPath(d, i, eventScale, eventDates))
    .attr("transform", (d, i) =>
      getIconTransform(d, i, eventScale, eventDates),
    );

  eventTicks
    .append("rect")
    .attr("fill", "none")
    .attr("width", RECT_SIZE)
    .attr("height", RECT_SIZE)
    .attr("transform", (d, i) =>
      getIconTransform(d, i, eventScale, eventDates),
    );

  eventTicks
    .filter((d, i) => hasEventText(d, i, eventScale, eventDates))
    .append("text")
    .attr("class", "event-text")
    .attr("transform", `translate(${TEXT_X},${TEXT_Y})`)
    .text(d => d.length);

  eventTicks
    .on("mousemove", function(d) {
      const eventTick = d3.select(this);
      const eventIcon = eventTicks.filter(data => d === data);
      const eventLine = eventLines.filter(data => d === data);

      onHoverChange({ element: eventIcon.node(), timelineEvents: d });
      eventTick.classed("hover", true);
      eventLine.classed("hover", true);
    })
    .on("mouseleave", function(d) {
      const eventTick = d3.select(this);
      const eventLine = eventLines.filter(data => d === data);

      onHoverChange(null);
      eventTick.classed("hover", isSelected(d, selectedEventIds));
      eventLine.classed("hover", isSelected(d, selectedEventIds));
    })
    .on("click", function(d) {
      onOpenTimelines();

      if (isSelected(d, selectedEventIds)) {
        onDeselectTimelineEvents(d);
      } else {
        onSelectTimelineEvents(d);
      }
    });
}

export function renderEvents(
  chart,
  {
    events = [],
    selectedEventIds = [],
    xDomain,
    xInterval,
    onHoverChange,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
  },
) {
  const axis = getXAxis(chart);
  const brush = getBrush(chart);

  const eventScale = getEventScale(chart, xDomain, xInterval);
  const eventMapping = getEventMapping(events, xInterval);
  const eventDates = getEventDates(eventMapping);
  const eventGroups = getEventGroups(eventMapping);

  if (brush) {
    renderEventLines({
      brush,
      eventScale,
      eventDates,
      eventGroups,
      selectedEventIds,
    });
  }

  if (axis) {
    renderEventTicks({
      axis,
      brush,
      eventScale,
      eventDates,
      eventGroups,
      selectedEventIds,
      onHoverChange,
      onOpenTimelines,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
    });
  }
}

export function hasEventAxis({ timelineEvents = [], isTimeseries }) {
  return isTimeseries && timelineEvents.length > 0;
}
