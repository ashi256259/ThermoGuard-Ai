from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime

class FIRMSDataProvider(ABC):
    """
    Abstract Base Class for NASA FIRMS Thermal Anomaly Data Provider.
    Decouples sample/simulated data ingestion from live satellite feeds.
    """
    @abstractmethod
    def fetch_hotspots(
        self,
        bbox: Optional[List[float]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        source: str = "VIIRS_SNPP"
    ) -> List[Dict[str, Any]]:
        """Fetch thermal anomaly records."""
        pass

    @abstractmethod
    def get_provider_status(self) -> Dict[str, Any]:
        """Return provider mode (DEMO vs LIVE_API) and health."""
        pass


class OSMDataProvider(ABC):
    """
    Abstract Base Class for OpenStreetMap Context Provider.
    Queries industrial POIs, landuse polygons, and infrastructure.
    """
    @abstractmethod
    def find_nearest_industrial_facility(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 50000.0
    ) -> Dict[str, Any]:
        """Query nearest industrial POI/complex within radius."""
        pass

    @abstractmethod
    def find_facilities_within_radius(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 10000.0
    ) -> List[Dict[str, Any]]:
        """Query all industrial facilities within a given radius."""
        pass

    @abstractmethod
    def query_infrastructure_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: float = 2000.0
    ) -> List[Dict[str, Any]]:
        """Query nearby roads, pipelines, power lines, and substations."""
        pass

    @abstractmethod
    def get_provider_status(self) -> Dict[str, Any]:
        """Return provider mode (DEMO vs LIVE_API) and configuration."""
        pass


class LandCoverProvider(ABC):
    """
    Abstract Base Class for Satellite Land-Use / Land-Cover Provider (e.g. ESA WorldCover).
    """
    @abstractmethod
    def get_land_cover_at_point(
        self,
        latitude: float,
        longitude: float
    ) -> Dict[str, Any]:
        """Return classified land-cover class and surrounding class distribution."""
        pass

    @abstractmethod
    def get_provider_status(self) -> Dict[str, Any]:
        """Return provider mode (DEMO vs LIVE_API) and dataset information."""
        pass
