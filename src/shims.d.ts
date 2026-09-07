declare module 'shpjs' {
  type ShapefileResult = GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]
  export default function shp(input: ArrayBuffer | string | { shp: ArrayBuffer; dbf?: ArrayBuffer; prj?: string; cpg?: string }): Promise<ShapefileResult>
}

declare namespace GeoJSON {
  interface FeatureCollection { type: 'FeatureCollection'; features: Feature[]; fileName?: string }
  interface Feature { type: 'Feature'; id?: string | number; geometry: Geometry | null; properties: Record<string, unknown> | null }
  type Position = number[]
  type Geometry =
    | { type: 'Point'; coordinates: Position }
    | { type: 'MultiPoint'; coordinates: Position[] }
    | { type: 'LineString'; coordinates: Position[] }
    | { type: 'MultiLineString'; coordinates: Position[][] }
    | { type: 'Polygon'; coordinates: Position[][] }
    | { type: 'MultiPolygon'; coordinates: Position[][][] }
    | { type: 'GeometryCollection'; geometries: Geometry[] }
}
